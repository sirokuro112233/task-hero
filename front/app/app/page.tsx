"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Hero = {
  id: number;
  username: string;
  current_level: number;
  total_exp: number;
  current_streak: number;
  tickets: number;
  last_active_date: string | null;
  avatar_data_url: string | null;
};

type Quest = {
  id: number;
  user_id: number;
  title: string;
  exp_reward: number;
  is_completed: boolean;
  is_buffed: boolean;
  target_date: string;
  completed_at: string | null;
};

type Reward = {
  id: number;
  name: string;
  description: string;
  rarity: "COMMON" | "RARE" | "EPIC" | "LEGENDARY";
};

type OwnedReward = {
  id: number;
  obtained_at: string;
  used_at: string | null;
  reward: Reward;
};

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
  const [userId, setUserId] = useState<number | null | undefined>(undefined);
  const [playerName, setPlayerName] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [creatingPlayer, setCreatingPlayer] = useState(false);
  const [hero, setHero] = useState<Hero | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [calendarQuests, setCalendarQuests] = useState<Quest[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [title, setTitle] = useState("");
  const [reward, setReward] = useState(100);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [inventory, setInventory] = useState<OwnedReward[]>([]);
  const [gachaReward, setGachaReward] = useState<Reward | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [timerMode, setTimerMode] = useState<"focus" | "break">("focus");
  const [secondsLeft, setSecondsLeft] = useState(FOCUS_SECONDS);
  const [isRunning, setIsRunning] = useState(false);
  const [timerConnected, setTimerConnected] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [musicFileName, setMusicFileName] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const musicUrlRef = useRef<string | null>(null);
  const alarmContextRef = useRef<AudioContext | null>(null);
  const previousSecondsRef = useRef(FOCUS_SECONDS);

  const playTimerAlarm = useCallback(() => {
    const context = alarmContextRef.current;
    if (!context) return;
    const now = context.currentTime;
    [0, 0.24, 0.48].forEach((delay, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = index === 2 ? 880 : 660;
      gain.gain.setValueAtTime(0.12, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + delay);
      oscillator.stop(now + delay + 0.19);
    });
  }, []);

  useEffect(() => {
    const storedUserId = window.localStorage.getItem("task-hero-auth-user-id");
    // ブラウザに保存されたプレイヤーを初回描画後に復元する。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUserId(storedUserId ? Number(storedUserId) : null);
  }, []);

  const loadData = useCallback(async (date = selectedDate) => {
    if (!userId) return;
    try {
      const [heroResponse, questsResponse, inventoryResponse] = await Promise.all([
        fetch(`${API}/users/${userId}`, { cache: "no-store" }),
        fetch(`${API}/quests?user_id=${userId}&target_date=${date}`, { cache: "no-store" }),
        fetch(`${API}/gacha/inventory/${userId}`, { cache: "no-store" }),
      ]);
      if (!heroResponse.ok) throw new Error(await getErrorMessage(heroResponse));
      if (!questsResponse.ok) throw new Error(await getErrorMessage(questsResponse));
      if (!inventoryResponse.ok) throw new Error(await getErrorMessage(inventoryResponse));
      setHero(await heroResponse.json());
      setQuests(await questsResponse.json());
      setInventory(await inventoryResponse.json());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "通信に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [selectedDate, userId]);

  const loadCalendar = useCallback(async () => {
    if (!userId) return;
    const firstDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const lastDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
    try {
      const response = await fetch(`${API}/quests?user_id=${userId}&date_from=${dateKey(firstDay)}&date_to=${dateKey(lastDay)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await getErrorMessage(response));
      setCalendarQuests(await response.json());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "カレンダーを読み込めませんでした");
    }
  }, [calendarMonth, userId]);

  useEffect(() => {
    // Data is loaded asynchronously; state updates occur only after the requests settle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData(selectedDate);
  }, [selectedDate, loadData]);

  useEffect(() => {
    // カレンダーの通信完了後に月間クエストを反映する。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCalendar();
  }, [loadCalendar]);

  useEffect(() => {
    if (!userId) return;
    let retry: number | undefined;
    let disposed = false;
    const connect = () => {
      const configuredUrl = process.env.NEXT_PUBLIC_WS_URL;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const baseUrl = configuredUrl ?? `${protocol}://${window.location.hostname}:8000`;
      const socket = new WebSocket(`${baseUrl}/ws/timer/${userId}`);
      socketRef.current = socket;
      socket.onopen = () => setTimerConnected(true);
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type !== "timer") return;
        if (previousSecondsRef.current > 0 && data.remaining === 0) {
          playTimerAlarm();
          setNotice(data.mode === "focus" ? "集中完了！キャンプで休憩しよう。" : "休憩完了！次の冒険へ出発しよう。");
        }
        previousSecondsRef.current = data.remaining;
        setTimerMode(data.mode);
        setSecondsLeft(data.remaining);
        setIsRunning(data.is_running);
      };
      socket.onclose = () => {
        setTimerConnected(false);
        if (!disposed) retry = window.setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      disposed = true;
      if (retry) window.clearTimeout(retry);
      socketRef.current?.close();
    };
  }, [playTimerAlarm, userId]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (musicUrlRef.current) URL.revokeObjectURL(musicUrlRef.current);
      void alarmContextRef.current?.close();
    };
  }, []);

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
    socketRef.current?.send(JSON.stringify({ action: "switch", mode }));
  };

  const toggleTimer = () => {
    if (!isRunning) {
      const context = alarmContextRef.current ?? new AudioContext();
      alarmContextRef.current = context;
      void context.resume();
    }
    socketRef.current?.send(JSON.stringify({ action: isRunning ? "pause" : "start" }));
  };

  const resetTimer = () => socketRef.current?.send(JSON.stringify({ action: "reset" }));

  const toggleMusic = async () => {
    if (!audioRef.current) {
      fileInputRef.current?.click();
      return;
    }
    if (soundOn) {
      audioRef.current.pause();
      setSoundOn(false);
      return;
    }
    try {
      await audioRef.current.play();
      setSoundOn(true);
    } catch {
      setError("音楽ファイルを再生できませんでした");
    }
  };

  const selectMusicFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    audioRef.current?.pause();
    if (musicUrlRef.current) URL.revokeObjectURL(musicUrlRef.current);
    const url = URL.createObjectURL(file);
    musicUrlRef.current = url;
    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = 0.35;
    audio.onended = () => setSoundOn(false);
    audio.onerror = () => {
      setSoundOn(false);
      setError("対応していない音楽ファイルです");
    };
    audioRef.current = audio;
    setMusicFileName(file.name);
    try {
      await audio.play();
      setSoundOn(true);
      setNotice(`BGM「${file.name}」を再生しています`);
    } catch {
      setSoundOn(false);
      setNotice(`BGM「${file.name}」を読み込みました`);
    }
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
      const response = await fetch(`${API}/quests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          title: title.trim(),
          exp_reward: reward,
          target_date: selectedDate,
        }),
      });
      if (!response.ok) throw new Error(await getErrorMessage(response));
      setTitle("");
      const body = await response.json();
      setNotice(body.quest.is_buffed ? `前日受注ボーナス！ ${body.quest.exp_reward} EXP のクエストを追加しました。` : "新しいクエストを受注しました！");
      await Promise.all([loadData(selectedDate), loadCalendar()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "クエストを追加できませんでした");
    } finally {
      setSaving(false);
    }
  };

  const drawGacha = async () => {
    setDrawing(true);
    setError("");
    try {
      const response = await fetch(`${API}/gacha/draw/${userId}`, { method: "POST" });
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const body = await response.json();
      if (!body.reward?.name) throw new Error("報酬データを取得できませんでした");
      setGachaReward(body.reward);
      setNotice(body.message ?? `「${body.reward.name}」を獲得しました！`);
      await Promise.all([loadData(selectedDate), loadCalendar()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ガチャを引けませんでした");
    } finally {
      setDrawing(false);
    }
  };

  const consumeReward = async (item: OwnedReward) => {
    if (!window.confirm(`「${item.reward.name}」を使用しますか？\nこの操作は取り消せません。`)) return;
    setError("");
    try {
      const response = await fetch(`${API}/gacha/inventory/${userId}/${item.id}/use`, { method: "PATCH" });
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const body = await response.json();
      setNotice(body.message ?? `「${item.reward.name}」を使用しました！`);
      await Promise.all([loadData(selectedDate), loadCalendar()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ご褒美アイテムを使用できませんでした");
    }
  };

  const completeQuest = async (quest: Quest) => {
    setError("");
    try {
      const response = await fetch(`${API}/quests/${quest.id}/complete`, { method: "PATCH" });
      if (!response.ok) throw new Error(await getErrorMessage(response));
      setNotice(`「${quest.title}」クリア！ +${quest.exp_reward} EXP`);
      await Promise.all([loadData(selectedDate), loadCalendar()]);
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
      await Promise.all([loadData(selectedDate), loadCalendar()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "クエストを削除できませんでした");
    }
  };

  const openProfile = () => {
    setProfileName(hero?.username ?? "");
    setAvatarPreview(hero?.avatar_data_url ?? null);
    setProfileOpen(true);
  };

  const selectAvatar = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("画像ファイルを選択してください");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("プロフィール画像は2MB以下にしてください");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => setError("画像を読み込めませんでした");
    reader.readAsDataURL(file);
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!profileName.trim() || !userId) return;
    setSavingProfile(true);
    setError("");
    try {
      const response = await fetch(`${API}/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: profileName.trim(), avatar_data_url: avatarPreview }),
      });
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const body = await response.json();
      setHero(body.user);
      setProfileOpen(false);
      setNotice(body.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "プロフィールを更新できませんでした");
    } finally {
      setSavingProfile(false);
    }
  };

  const createPlayer = async (event: FormEvent) => {
    event.preventDefault();
    if (!playerName.trim() || password.length < 6) return;
    setCreatingPlayer(true);
    setError("");
    try {
      const response = await fetch(`${API}/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: playerName.trim(), password }),
      });
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const body = await response.json();
      window.localStorage.setItem("task-hero-auth-user-id", String(body.user.id));
      setHero(body.user);
      setUserId(body.user.id);
      setNotice(body.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ログインできませんでした");
    } finally {
      setCreatingPlayer(false);
    }
  };

  const logout = () => {
    if (isRunning) socketRef.current?.send(JSON.stringify({ action: "pause" }));
    window.localStorage.removeItem("task-hero-auth-user-id");
    socketRef.current?.close();
    setHero(null);
    setQuests([]);
    setInventory([]);
    setCalendarQuests([]);
    setPlayerName("");
    setPassword("");
    setUserId(null);
    setNotice("");
    setError("");
  };

  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const leading = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    return [...Array(leading).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];
  }, [calendarMonth]);

  const questsByDate = useMemo(() => {
    return calendarQuests.reduce<Record<string, Quest[]>>((grouped, quest) => {
      (grouped[quest.target_date] ??= []).push(quest);
      return grouped;
    }, {});
  }, [calendarQuests]);

  const moveCalendarMonth = (offset: number) => {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  const selectCalendarDay = (day: number) => {
    const date = dateKey(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day));
    chooseDate(date);
    window.setTimeout(() => document.getElementById("quest-board")?.scrollIntoView({ behavior: "smooth" }), 0);
  };

  if (userId === undefined) {
    return <main className="onboarding"><div className="onboarding-loader">◆</div></main>;
  }

  if (userId === null) {
    return (
      <main className="onboarding">
        <section className="onboarding-card">
          <div className="onboarding-logo"><span>⚔</span></div>
          <div className="auth-tabs">
            <button className={authMode === "login" ? "active" : ""} onClick={() => { setAuthMode("login"); setError(""); }}>ログイン</button>
            <button className={authMode === "register" ? "active" : ""} onClick={() => { setAuthMode("register"); setError(""); }}>新規登録</button>
          </div>
          <p className="eyebrow">{authMode === "login" ? "WELCOME BACK" : "NEW ADVENTURE"}</p>
          <h1>{authMode === "login" ? "冒険を再開しよう。" : "勇者よ、名を告げよ。"}</h1>
          <p className="onboarding-copy">{authMode === "login" ? <>登録したプレイヤー名とパスワードを入力してください。</> : <>毎日の小さなタスクが、あなたの冒険になる。<br />新しいプレイヤーを作成しよう。</>}</p>
          {error && <div className="onboarding-error">! {error}</div>}
          <form onSubmit={createPlayer}>
            <label htmlFor="player-name">PLAYER NAME</label>
            <input id="player-name" autoFocus maxLength={50} value={playerName} onChange={(event) => setPlayerName(event.target.value)} placeholder="名前を入力" />
            <label htmlFor="player-password">PASSWORD</label>
            <div className="password-input"><input id="player-password" type={showPassword ? "text" : "password"} minLength={6} maxLength={100} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="6文字以上" /><button type="button" onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? "隠す" : "表示"}</button></div>
            <button className="auth-submit" disabled={creatingPlayer || !playerName.trim() || password.length < 6}>{creatingPlayer ? "CONNECTING..." : authMode === "login" ? "▶ LOGIN & CONTINUE" : "▶ CREATE & START"}</button>
          </form>
          <small>YOUR QUEST BEGINS HERE ▸▸</small>
        </section>
      </main>
    );
  }

  return (
    <main className={`game-shell ${timerMode === "break" ? "night-mode" : ""}`}>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Task Hero ホーム">
          <span className="brand-sword">◆</span>
          <span><b>TASK HERO</b><small>8-BIT QUEST LOG</small></span>
        </a>
        <div className="header-actions">
          <a className="calendar-nav" href="#calendar">▦ 記録</a>
          <a className="gacha-nav" href="#gacha"><span>🎁</span> ガチャ <b>T × {hero?.tickets ?? 0}</b></a>
          <div className="streak"><span>🔥</span><span><small>STREAK</small><b>{hero?.current_streak ?? 0} DAYS</b></span></div>
          <div className="music-control">
            {musicFileName && <span title={musicFileName}>{musicFileName}</span>}
            <input ref={fileInputRef} type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac" onChange={(event) => void selectMusicFile(event)} aria-label="BGMファイルを選択" />
          <button className={`sound-button ${soundOn ? "playing" : ""}`} onClick={() => void toggleMusic()} aria-label={musicFileName ? (soundOn ? "BGMを停止" : "BGMを再生") : "BGMファイルを選択"} aria-pressed={soundOn} title={musicFileName ? (soundOn ? "BGMを停止" : "BGMを再生") : "BGMファイルを選択"}>{soundOn ? "♫" : musicFileName ? "▶" : "+♪"}</button>
          </div>
          <button className="logout-button" onClick={logout}>↪ ログアウト</button>
        </div>
      </header>

      <section className="hero-strip" id="top">
        <button className="avatar" onClick={openProfile} aria-label="プロフィールを編集" title="プロフィールを編集">
          {hero?.avatar_data_url ? <span className="avatar-image" style={{ backgroundImage: `url(${hero.avatar_data_url})` }} /> : <span>⚔</span>}
        </button>
        <div className="hero-details">
          <p className="eyebrow">PLAYER STATUS</p>
          <div className="hero-name"><h1>{hero?.username ?? "HERO"}</h1><button onClick={openProfile}>✎ 編集</button></div>
          <div className="level-line"><b>LV. {hero?.current_level ?? 1}</b><span>{levelExp} / 1000 EXP</span></div>
          <div className="exp-track"><span style={{ width: `${levelExp / 10}%` }} /></div>
        </div>
        <div className="hero-stats">
          <div><span className="stat-icon">⚡</span><span><small>TOTAL EXP</small><b>{(hero?.total_exp ?? 0).toLocaleString()}</b></span></div>
          <div><span className="stat-icon ticket">T</span><span><small>TICKETS</small><b>{hero?.tickets ?? 0}</b></span></div>
        </div>
      </section>

      {(notice || error) && (
        <div className={`toast ${error ? "toast-error" : ""}`} role="status">
          <span>{error ? "!" : "★"}</span>{error || notice}
          <button onClick={() => { setNotice(""); setError(""); }} aria-label="閉じる">×</button>
        </div>
      )}

      <div className="dashboard">
        <section className="panel quest-panel" id="quest-board">
          <div className="panel-heading">
            <div><p className="eyebrow">QUEST BOARD · {selectedDate}</p><h2>{selectedDate === addDays(0) ? "今日の冒険" : "冒険の記録"}</h2></div>
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
                <div className="quest-copy"><h3>{quest.title}</h3><span>+{quest.exp_reward} EXP {quest.is_buffed && <em>×1.5 BUFF</em>}</span></div>
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
            <p className="timer-label"><i className={timerConnected ? "online" : ""} />{timerConnected ? " SERVER SYNC" : " RECONNECTING"} · {timerMode === "focus" ? "ADVENTURE" : "CAMP"}</p>
            <div className="timer-value">{formattedTime}</div>
            <button disabled={!timerConnected} className={`timer-button ${isRunning ? "pause" : ""}`} onClick={toggleTimer}>
              {isRunning ? "Ⅱ  PAUSE" : secondsLeft < (timerMode === "focus" ? FOCUS_SECONDS : BREAK_SECONDS) ? "▶  RESUME" : "▶  START QUEST"}
            </button>
            <button className="reset-button" onClick={resetTimer}>↻ RESET TIMER</button>
          </section>

          <section className="tip-card">
            <span className="tip-icon">!</span>
            <div><p>HERO&apos;S TIP</p><h3>最初の5分が、いちばん強い。</h3><span>完璧じゃなくていい。まず剣を抜こう。</span></div>
          </section>

          <section className="panel gacha-panel" id="gacha">
            <div className="gacha-title"><span>✦</span><div><p className="eyebrow">REWARD GACHA</p><h2>ごほうび宝箱</h2></div></div>
            <p className="gacha-copy">レベルアップで手に入るチケットを使って、現実世界の報酬を召喚しよう。</p>
            <div className="ticket-balance"><span>所持チケット</span><b>T × {hero?.tickets ?? 0}</b></div>
            <button className="gacha-button" disabled={drawing || !hero?.tickets} onClick={() => void drawGacha()}>{drawing ? "召喚中..." : hero?.tickets ? "宝箱を開ける　T × 1" : "チケットを獲得して宝箱を開けよう"}</button>
            <div className="inventory-title"><span>REWARD LOG</span><b>{inventory.length}</b></div>
            <div className="reward-list">
              {inventory.length === 0 ? <p>獲得した報酬はまだありません</p> : inventory.slice(0, 5).map((item) => (
                <div className={item.used_at ? "reward-used" : ""} key={item.id}>
                  <span className={`rarity ${item.reward.rarity.toLowerCase()}`}>{item.reward.rarity}</span>
                  <b>{item.reward.name}</b>
                  {item.used_at ? <small>使用済み</small> : <button onClick={() => void consumeReward(item)}>使う</button>}
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <section className="calendar-section" id="calendar">
        <div className="panel calendar-panel">
          <div className="calendar-heading">
            <div><p className="eyebrow">ADVENTURE ARCHIVE</p><h2>冒険カレンダー</h2></div>
            <div className="calendar-controls">
              <button onClick={() => moveCalendarMonth(-1)} aria-label="前月">◀</button>
              <b>{calendarMonth.getFullYear()} / {String(calendarMonth.getMonth() + 1).padStart(2, "0")}</b>
              <button onClick={() => moveCalendarMonth(1)} aria-label="翌月">▶</button>
            </div>
          </div>
          <p className="calendar-description">日付を選ぶと、その日に挑戦したクエストを振り返れます。</p>
          <div className="calendar-weekdays"><span>SUN</span><span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span></div>
          <div className="calendar-grid">
            {calendarCells.map((day, index) => {
              if (day === null) return <div className="calendar-empty" key={`empty-${index}`} />;
              const key = dateKey(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day));
              const dayQuests = questsByDate[key] ?? [];
              const dayCompleted = dayQuests.filter((quest) => quest.is_completed).length;
              return (
                <button className={`${key === dateKey(new Date()) ? "today" : ""} ${key === selectedDate ? "selected" : ""}`} key={key} onClick={() => selectCalendarDay(day)}>
                  <b>{day}</b>
                  {dayQuests.length > 0 && <><span>{dayCompleted}/{dayQuests.length}</span><i style={{ width: `${(dayCompleted / dayQuests.length) * 100}%` }} /></>}
                </button>
              );
            })}
          </div>
          <div className="calendar-summary"><span>今月のクエスト <b>{calendarQuests.length}</b></span><span>達成 <b>{calendarQuests.filter((quest) => quest.is_completed).length}</b></span><span>獲得EXP <b>{calendarQuests.filter((quest) => quest.is_completed).reduce((sum, quest) => sum + quest.exp_reward, 0)}</b></span></div>
        </div>
      </section>

      {gachaReward && <div className="reward-modal" role="dialog" aria-modal="true" aria-label="獲得報酬">
        <div className="reward-card"><button onClick={() => setGachaReward(null)} aria-label="閉じる">×</button><span className="chest">🎁</span><p>{gachaReward.rarity}</p><h2>{gachaReward.name}</h2><div>{gachaReward.description}</div><button className="claim" onClick={() => setGachaReward(null)}>GET REWARD!</button></div>
      </div>}

      {profileOpen && <div className="reward-modal" role="dialog" aria-modal="true" aria-label="プロフィール編集">
        <form className="profile-card" onSubmit={saveProfile}>
          <button className="modal-close" type="button" onClick={() => setProfileOpen(false)} aria-label="閉じる">×</button>
          <p className="eyebrow">PLAYER SETTINGS</p>
          <h2>プロフィール編集</h2>
          <label className="avatar-picker">
            <span className="profile-preview" style={avatarPreview ? { backgroundImage: `url(${avatarPreview})` } : undefined}>{!avatarPreview && "⚔"}</span>
            <b>画像を選択</b>
            <small>JPG / PNG / GIF・最大2MB</small>
            <input type="file" accept="image/*" onChange={selectAvatar} />
          </label>
          {avatarPreview && <button className="remove-avatar" type="button" onClick={() => setAvatarPreview(null)}>画像を削除</button>}
          <label className="profile-name-label" htmlFor="profile-name">PLAYER NAME</label>
          <input className="profile-name-input" id="profile-name" maxLength={50} value={profileName} onChange={(event) => setProfileName(event.target.value)} />
          <button className="save-profile" disabled={savingProfile || !profileName.trim()}>{savingProfile ? "SAVING..." : "✓ SAVE PROFILE"}</button>
        </form>
      </div>}

      <footer><span>© 2026 TASK HERO</span><span>KEEP MOVING FORWARD ▸▸</span></footer>
    </main>
  );
}
