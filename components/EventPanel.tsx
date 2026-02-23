'use client';
import { useState, useEffect } from 'react';
import { CctvItem } from '@/types/cctv';

interface CctvEvent {
    id: string;
    cctvId: string;
    cctvName: string;
    region: string;
    type: string;
    severity: 'high' | 'medium' | 'low';
    message: string;
    time: Date;
}

const SEV_LABEL = { high: '긴급', medium: '주의', low: '정보' };
const SEV_COLOR = {
    high: 'var(--neon-red)',
    medium: 'var(--neon-amber)',
    low: 'var(--neon-green)',
};

const EVENT_MESSAGES = {
    high: ['움직임 감지 — 비인가 인원 접근', '영상 신호 단절 — 즉시 확인', '카메라 훼손 감지'],
    medium: ['야간 조도 부족 — 품질 저하', '강풍으로 방향 틀어짐', '네트워크 패킷 손실 15%'],
    low: ['정기 점검 예정 (내일 10:00)', '펌웨어 업데이트 완료', '백업 스트림 전환 완료'],
};

function makeDummy(items: CctvItem[]): CctvEvent {
    const item = items[Math.floor(Math.random() * items.length)];
    const sevs = ['high', 'medium', 'low'] as const;
    // Weight toward low/medium
    const weights = [0.15, 0.35, 0.5];
    const r = Math.random();
    const sev = sevs[r < 0.15 ? 0 : r < 0.5 ? 1 : 2];
    const msgs = EVENT_MESSAGES[sev];
    return {
        id: Math.random().toString(36).slice(2),
        cctvId: item.id,
        cctvName: item.name,
        region: item.region,
        type: item.type,
        severity: sev,
        message: msgs[Math.floor(Math.random() * msgs.length)],
        time: new Date(),
    };
}

interface Props {
    items: CctvItem[];
    onLocate: (cctvId: string) => void;
}

export default function EventPanel({ items, onLocate }: Props) {
    const [events, setEvents] = useState<CctvEvent[]>([]);
    const [selected, setSelected] = useState<string | null>(null);

    useEffect(() => {
        if (!items.length) return;
        setEvents([makeDummy(items), makeDummy(items), makeDummy(items)]);
        const id = setInterval(() => {
            setEvents(prev => [makeDummy(items), ...prev].slice(0, 30));
        }, 9000);
        return () => clearInterval(id);
    }, [items]);

    const highCount = events.filter(e => e.severity === 'high').length;
    const medCount = events.filter(e => e.severity === 'medium').length;

    return (
        <div className="glass-panel" style={{
            borderRadius: 12, display: 'flex', flexDirection: 'column',
            overflow: 'hidden', minHeight: 0,
        }}>
            {/* 헤더 */}
            <div style={{
                padding: '11px 14px',
                borderBottom: '1px solid var(--border-glass)',
                background: 'rgba(13,25,48,0.85)', flexShrink: 0
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                        fontSize: 11, fontWeight: 800, color: 'var(--neon-blue)',
                        letterSpacing: '0.08em', textShadow: '0 0 10px rgba(64,196,255,0.5)'
                    }}>
                        ⚡ LIVE EVENTS
                    </span>
                    <div style={{ display: 'flex', gap: 5 }}>
                        {highCount > 0 && <span className="badge badge-red">{highCount} 긴급</span>}
                        {medCount > 0 && <span className="badge badge-amber">{medCount} 주의</span>}
                    </div>
                </div>
                <div style={{ fontSize: 10, color: '#334155', marginTop: 3 }}>
                    총 {events.length}건 · MFSR 룰셋 기반 · AI 배제
                </div>
            </div>

            {/* 이벤트 목록 */}
            <div style={{
                flex: 1, overflowY: 'auto', padding: '9px 10px',
                display: 'flex', flexDirection: 'column', gap: 7
            }}>
                {events.length === 0 && (
                    <div style={{
                        textAlign: 'center', color: '#334155',
                        padding: '36px 0', fontSize: 12
                    }}>이벤트 없음</div>
                )}
                {events.map(ev => {
                    const sColor = SEV_COLOR[ev.severity];
                    return (
                        <div key={ev.id}
                            onClick={() => { setSelected(ev.id); onLocate(ev.cctvId); }}
                            style={{
                                padding: '9px 11px', borderRadius: 8, cursor: 'pointer',
                                background: selected === ev.id ? `${sColor}15` : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${selected === ev.id ? sColor + '50' : 'rgba(255,255,255,0.06)'}`,
                                transition: 'all 0.15s',
                            }}
                        >
                            <div style={{
                                display: 'flex', justifyContent: 'space-between',
                                alignItems: 'flex-start', marginBottom: 4, gap: 4
                            }}>
                                <span style={{
                                    fontSize: 11, color: '#e2e8f0', fontWeight: 700,
                                    flex: 1, lineHeight: 1.3
                                }}>
                                    {ev.cctvName}
                                </span>
                                <span style={{
                                    fontSize: 9, fontWeight: 800, flexShrink: 0,
                                    color: sColor, background: `${sColor}15`,
                                    padding: '2px 7px', borderRadius: 4,
                                    border: `1px solid ${sColor}30`,
                                }}>
                                    {SEV_LABEL[ev.severity]}
                                </span>
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 5, lineHeight: 1.4 }}>
                                {ev.message}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', gap: 5 }}>
                                    <span style={{
                                        fontSize: 9, color: '#475569',
                                        background: 'rgba(255,255,255,0.04)', padding: '1px 6px', borderRadius: 3
                                    }}>
                                        📍 {ev.region}
                                    </span>
                                    <span style={{
                                        fontSize: 9, color: '#334155', fontFamily: 'monospace',
                                        background: 'rgba(255,255,255,0.03)', padding: '1px 5px', borderRadius: 3
                                    }}>
                                        {ev.cctvId}
                                    </span>
                                </div>
                                <span style={{ fontSize: 9, color: '#334155' }}>
                                    {ev.time.toLocaleTimeString('ko-KR', { hour12: false })}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* 하단 외부 링크 */}
            <div style={{
                padding: '9px 11px',
                borderTop: '1px solid var(--border-glass)',
                background: 'rgba(13,25,48,0.85)', flexShrink: 0
            }}>
                <a href="https://uav-vercel.vercel.app" target="_blank" rel="noreferrer"
                    style={{
                        display: 'block', textAlign: 'center', padding: '7px',
                        background: 'rgba(99,102,241,0.08)',
                        border: '1px solid rgba(99,102,241,0.22)',
                        borderRadius: 7, color: '#818cf8', fontSize: 11,
                        fontWeight: 700, textDecoration: 'none', letterSpacing: '0.04em',
                    }}>
                    🛸 드론 운용 판단 시스템 →
                </a>
            </div>
        </div>
    );
}
