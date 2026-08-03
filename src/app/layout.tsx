import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'PathRescue — AI 智慧旅遊導航與救援',
  description:
    '用 AI 規劃貼近現實的行程，地圖校準景點，現場一鍵救援雨天備案。',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased">{children}</body>
    </html>
  );
}
