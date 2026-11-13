import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '은혜 선교카페 | 스마트 주문 & POS 시스템',
  description: '교회 선교카페용 모바일 QR 주문 및 태블릿 카운터 POS 시스템',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
