"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Hero = {
  id: number;
  username: string;
  current_level: number;
  total_exp: number;
  current_streak: number;
};

type Quest = {
  id: number;
  user_id: number;
  title: string;
  exp_reward: number;
  is_completed: boolean;
  target_date: string;
  completed_at: string | null;
};

const USER_ID = 1;
const API = "/api";
const FOCUS_SECONDS = 25 * 60;
const BREAK_SECONDS = 5 * 60;

const dateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateKey(date);
};

const getErrorMessage = async (response: Response) => {
  try {
    const body = await response.json();
    return body.detail ?? body.message ?? "通信に失敗しました";
  } catch {
    return "通信に失敗しました";
  }
};

export default function Home() {
  const [hero, setHero] = useState<Hero | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [title, setTitle] = useState("");
  const [reward, setReward] = useState(100);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [timerMode, setTimerMode] = useState<"focus" | "break">("focus");
  const [secondsLeft, setSecondsLeft] = useState(FOCUS_SECONDS);
  const [isRunning, setIsRunning] = useState(false);
  const endAtRef = useRef<number | null>(null);

  const loadData = useCallback(async (date = selectedDate) => {
    try {
      const [heroResponse, questsResponse] = await Promise.all([
        fetch(`${API}/users/${USER_ID}`, { cache: "no-store" }),
        fetch(`${API}/quests?user_id=${USER_ID}&target_date=${date}`, { cache: "no-store" }),
      ]);
      if (!heroResponse.ok) throw new Error(await getErrorMessage(heroResponse));
      if (!questsResponse.ok) throw new Error(await getErrorMessage(questsResponse));
      setHero(await heroResponse.json());
      setQuests(await questsResponse.json());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "通信に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    // Data is loaded asynchronously; state updates occur only after the requests settle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData(selectedDate);
  }, [selectedDate, loadData]);

  useEffect(() => {
    if (!isRunning) return;
    const interval = window.setInterval(() => {
      const next = Math.max(0, Math.ceil(((endAtRef.current ?? Date.now()) - Date.now()) / 1000));
      setSecondsLeft(next);
      if (next === 0) {
        window.clearInterval(interval);
        setIsRunning(false);
        setNotice(timerMode === "focus" ? "集中完了！休憩して HP を回復しよう。" : "休憩完了！次の冒険へ出発しよう。" );
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [isRunning, timerMode]);

  const completed = quests.filter((quest) => quest.is_completed).length;
  const progress = quests.length ? Math.round((completed / quests.length) * 100) : 0;
  const levelExp = (hero?.total_exp ?? 0) % 1000;
  const tomorrow = addDays(1);
  const isTomorrow = selectedDate === tomorrow;

  const formattedTime = useMemo(() => {
    const minutes = Math.floor(secondsLeft / 60).toString().padStart(2, "0");
    const seconds = (secondsLeft % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [secondsLeft]);

  const switchTimerMode = (mode: "focus" | "break") => {
    setTimerMode(mode);
    setSecondsLeft(mode === "focus" ? FOCUS_SECONDS : BREAK_SECONDS);
    setIsRunning(false);
    endAtRef.current = null;
  };

  const toggleTimer = () => {
    if (!isRunning) endAtRef.current = Date.now() + secondsLeft * 1000;
    setIsRunning((running) => !running);
  };

  const chooseDate = (date: string) => {
    setLoading(true);
    setError("");
    setSelectedDate(date);
  };

  const submitQuest = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError("");
    try {
      const expReward = isTomorrow ? Math.round(reward * 1.5) : reward;
      const response = await fetch(`${API}/quests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: USER_ID,
          title: title.trim(),
          exp_reward: expReward,
          is_completed: false,
          target_date: selectedDate,
        }),
      });
      if (!response.ok) throw new Error(await getErrorMessage(response));
      setTitle("");
      setNotice(isTomorrow ? `前日受注ボーナス！ ${expReward} EXP のクエストを追加しました。` : "新しいクエストを受注しました！");
      await loadData(selectedDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "クエストを追加できませんでした");
    } finally {
      setSaving(false);
    }
  };

  const completeQuest = async (quest: Quest) => {
    setError("");
    try {
      const response = await fetch(`${API}/quests/${quest.id}/complete`, { method: "PATCH" });
      if (!response.ok) throw new Error(await getErrorMessage(response));
      setNotice(`「${quest.title}」クリア！ +${quest.exp_reward} EXP`);
      await loadData(selectedDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "クエストを完了できませんでした");
    }
  };

  const deleteQuest = async (quest: Quest) => {
    if (!window.confirm(`「${quest.title}」を破棄しますか？`)) return;
    setError("");
    try {
      const response = await fetch(`${API}/quests/${quest.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await getErrorMessage(response));
      setNotice("クエストを破棄しました。");
      await loadData(selectedDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "クエストを削除できませんでした");
    }
  };

  return (
    <main className={`game-shell ${timerMode === "break" ? "night-mode" : ""}`}>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Task Hero ホーム">
          <span className="brand-sword">◆</span>
          <span><b>TASK HERO</b><small>8-BIT QUEST LOG</small></span>
        </a>
        <div className="header-actions">
          <div className="streak"><span>🔥</span><span><small>STREAK</small><b>{hero?.current_streak ?? 0} DAYS</b></span></div>
          <button className="sound-button" aria-label="サウンド設定">♪</button>
        </div>
      </header>

      <section className="hero-strip" id="top">
        <div className="avatar" aria-hidden="true"><span>⚔</span></div>
        <div className="hero-details">
          <p className="eyebrow">PLAYER STATUS</p>
          <h1>{hero?.username ?? "HERO"}</h1>
          <div className="level-line"><b>LV. {hero?.current_level ?? 1}</b><span>{levelExp} / 1000 EXP</span></div>
          <div className="exp-track"><span style={{ width: `${levelExp / 10}%` }} /></div>
        </div>
        <div className="hero-stats">
          <div><span className="stat-icon">⚡</span><span><small>TOTAL EXP</small><b>{(hero?.total_exp ?? 0).toLocaleString()}</b></span></div>
          <div><span className="stat-icon ticket">T</span><span><small>TICKETS</small><b>{Math.floor((hero?.current_level ?? 1) / 3)}</b></span></div>
        </div>
      </section>

      {(notice || error) && (
        <div className={`toast ${error ? "toast-error" : ""}`} role="status">
          <span>{error ? "!" : "★"}</span>{error || notice}
          <button onClick={() => { setNotice(""); setError(""); }} aria-label="閉じる">×</button>
        </div>
      )}

      <div className="dashboard">
        <section className="panel quest-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">QUEST BOARD</p><h2>今日の冒険</h2></div>
            <div className="completion"><b>{completed}/{quests.length}</b><span>COMPLETE</span></div>
          </div>

          <div className="date-tabs" role="tablist" aria-label="クエストの日付">
            <button className={selectedDate === addDays(-1) ? "active" : ""} onClick={() => chooseDate(addDays(-1))}><small>YESTERDAY</small>きのう</button>
            <button className={selectedDate === addDays(0) ? "active" : ""} onClick={() => chooseDate(addDays(0))}><small>TODAY</small>きょう</button>
            <button className={selectedDate === tomorrow ? "active buff" : ""} onClick={() => chooseDate(tomorrow)}><small>TOMORROW</small>あした <span>×1.5</span></button>
          </div>

          <div className="quest-progress"><span style={{ width: `${progress}%` }} /></div>

          <div className="quest-list" aria-live="polite">
            {loading ? (
              <div className="empty-state"><span className="hourglass">◆</span><p>クエストを読み込み中...</p></div>
            ) : quests.length === 0 ? (
              <div className="empty-state"><span>♜</span><p>クエストはまだありません</p><small>小さな一歩から冒険を始めよう！</small></div>
            ) : quests.map((quest) => (
              <article className={`quest-item ${quest.is_completed ? "done" : ""}`} key={quest.id}>
                <button className="check-button" disabled={quest.is_completed} onClick={() => void completeQuest(quest)} aria-label={`${quest.title}を完了`}>
                  {quest.is_completed ? "✓" : ""}
                </button>
                <div className="quest-copy"><h3>{quest.title}</h3><span>+{quest.exp_reward} EXP</span></div>
                <button className="delete-button" onClick={() => void deleteQuest(quest)} aria-label={`${quest.title}を削除`}>×</button>
              </article>
            ))}
          </div>

          <form className="quest-form" onSubmit={submitQuest}>
            <label htmlFor="quest-title">NEW MICRO QUEST</label>
            <div className="input-row">
              <input id="quest-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={255} placeholder="例：エディタを開く" />
              <select value={reward} onChange={(event) => setReward(Number(event.target.value))} aria-label="経験値">
                <option value={50}>50 EXP</option><option value={100}>100 EXP</option><option value={200}>200 EXP</option>
              </select>
              <button disabled={saving || !title.trim()}>{saving ? "..." : "+ 受注"}</button>
            </div>
            {isTomorrow && <p className="buff-note">★ 前日受注バフ適用：獲得 EXP が 1.5倍！</p>}
          </form>
        </section>

        <aside className="side-column">
          <section className="panel timer-panel">
            <div className="timer-tabs">
              <button className={timerMode === "focus" ? "active" : ""} onClick={() => switchTimerMode("focus")}>⚔ FOCUS</button>
              <button className={timerMode === "break" ? "active" : ""} onClick={() => switchTimerMode("break")}>♨ CAMP</button>
            </div>
            <div className="adventure-scene" aria-label={timerMode === "focus" ? "勇者の冒険" : "焚き火で休憩"}>
              <div className="cloud cloud-one" /><div className="cloud cloud-two" />
              <div className="mountain mountain-one" /><div className="mountain mountain-two" />
              <div className="scene-character">{timerMode === "focus" ? "🏃" : "🧙"}</div>
              <div className="scene-object">{timerMode === "focus" ? "🐉" : "🔥"}</div>
              <div className="ground" />
            </div>
            <p className="timer-label">{timerMode === "focus" ? "ADVENTURE IN PROGRESS" : "RECOVERING AT CAMP"}</p>
            <div className="timer-value">{formattedTime}</div>
            <button className={`timer-button ${isRunning ? "pause" : ""}`} onClick={toggleTimer}>
              {isRunning ? "Ⅱ  PAUSE" : secondsLeft < (timerMode === "focus" ? FOCUS_SECONDS : BREAK_SECONDS) ? "▶  RESUME" : "▶  START QUEST"}
            </button>
            <button className="reset-button" onClick={() => switchTimerMode(timerMode)}>↻ RESET TIMER</button>
          </section>

          <section className="tip-card">
            <span className="tip-icon">!</span>
            <div><p>HERO&apos;S TIP</p><h3>最初の5分が、いちばん強い。</h3><span>完璧じゃなくていい。まず剣を抜こう。</span></div>
          </section>
        </aside>
      </div>

      <footer><span>© 2026 TASK HERO</span><span>KEEP MOVING FORWARD ▸▸</span></footer>
    </main>
  );
}
