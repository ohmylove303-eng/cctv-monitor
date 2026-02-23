import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: '김포·인천 CCTV 통합 관제 상황실',
    description: 'MFSR 포렌식 기반 실시간 CCTV 감시 시스템 — 생성형 AI 전면 배제 · MapLibre GL',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="ko">
            <body style={{ margin: 0, padding: 0, background: '#020617', overflow: 'hidden' }}>
                {children}
            </body>
        </html>
    );
}
