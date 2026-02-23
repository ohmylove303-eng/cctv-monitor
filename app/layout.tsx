import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'CCTV 통합 관제 상황실 | 김포·인천',
    description:
        '김포·인천 CCTV 통합 관제 시스템 — MFSR 포렌식 룰셋 기반, 생성형 AI 판단 배제, Next.js 14 + MapLibre GL',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="ko">
            <body style={{ margin: 0, padding: 0, background: '#020617' }}>{children}</body>
        </html>
    );
}
