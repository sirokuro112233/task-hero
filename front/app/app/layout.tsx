import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Task Hero | 8-Bit Quest Log",
  description: "毎日のタスクを冒険に変える、レトロRPG風タスク管理＆ポモドーロタイマー。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
