'use client';
import { useEffect, useState } from 'react';
import { CctvItem } from '@/types/cctv';

interface Props { allItems: CctvItem[]; }

export default function StatusBar({ allItems }: Props) {
    const [time, setTime] = useState<Date | null>(null);

    useEffect(() => {
        setTime(new Date());
        const t = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    const total = allItems.length;
    const normal = allItems.filter(c => c.status === '정상').length;
    const inspect = allItems.filter(c => c.status === '점검중').length;
    const fault = allItems.filter(c => c.status === '고장').length;

    const hh = time ? time.getHours().toString().padStart(2, '0') : '--';
    const mm = time ? time.getMinutes().toString().padStart(2, '0') : '--';
    const ss = time ? time.getSeconds().toString().padStart(2, '0') : '--';
    const dateStr = time ? time.toLocaleDateString('ko-KR', {
        year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    }) : 'Loading';

    return (
        <div className="glass-panel" style={{
            borderRadius: 10, padding: '10px 18px',
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        }}>
            {/* 브랜딩 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                    width: 38, height: 38, borderRadius: 9,
                    background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                    boxShadow: '0 0 16px rgba(99,102,241,0.5)',
                }}>📡</div>
                <div>
                    <div style={{
                        fontSize: 9, color: '#475569', letterSpacing: '0.14em',
                        fontWeight: 700, textTransform: 'uppercase', marginBottom: 1
                    }}>
                        CCTV MONITOR SYSTEM
                    </div>
                    <div style={{
                        fontSize: 15, fontWeight: 800, color: 'var(--neon-blue)',
                        letterSpacing: '0.02em', textShadow: '0 0 14px rgba(64,196,255,0.5)'
                    }}>
                        김포 · 인천 통합 관제 상황실
                    </div>
                </div>
                <div style={{ width: 1, height: 32, background: 'rgba(64,196,255,0.15)', margin: '0 4px' }} />
                <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, letterSpacing: '0.06em' }}>
                    ● LIVE 실시간 모니터 중
                </span>
            </div>

            {/* 통계 배지 */}
            <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                {[
                    { label: `전체 ${total}대`, cls: 'badge-blue' },
                    { label: `정상 ${normal}`, cls: 'badge-green' },
                    ...(inspect > 0 ? [{ label: `점검중 ${inspect}`, cls: 'badge-amber' }] : []),
                    ...(fault > 0 ? [{ label: `⚠ 고장 ${fault}`, cls: 'badge-red' }] : []),
                    { label: 'MFSR 포렌식 준비', cls: 'badge-purple' },
                ].map(b => (
                    <span key={b.label} className={`badge ${b.cls}`}>{b.label}</span>
                ))}
            </div>

            {/* 시계 */}
            <div style={{ textAlign: 'right' }}>
                <div style={{
                    fontSize: 24, fontWeight: 800, color: 'white',
                    fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                    letterSpacing: '0.06em',
                    textShadow: '0 0 12px rgba(64,196,255,0.4)',
                }}>{hh}:{mm}:{ss}</div>
                <div style={{ fontSize: 10, color: '#475569', marginTop: 1 }}>{dateStr} KST</div>
            </div>
        </div>
    );
}
