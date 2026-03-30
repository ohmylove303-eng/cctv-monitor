'use client';
import { useMemo, useState } from 'react';
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

const STATUS_EVENT_MAP = {
    고장: {
        severity: 'high' as const,
        message: '영상 신호 단절 또는 카메라 장애가 감지되었습니다.',
    },
    점검중: {
        severity: 'medium' as const,
        message: '장비 점검 상태입니다. 유지보수 진행 여부를 확인하세요.',
    },
};

interface Props {
    items: CctvItem[];
    onLocate: (cctvId: string) => void;
}

export default function EventPanel({ items, onLocate }: Props) {
    const [selected, setSelected] = useState<string | null>(null);
    const events = useMemo<CctvEvent[]>(
        () => {
            const eventItems = items.filter(
                (item): item is CctvItem & { status: '고장' | '점검중' } =>
                    item.status === '고장' || item.status === '점검중'
            );

            return eventItems.slice(0, 30).map((item) => ({
                id: `EVENT-${item.id}`,
                cctvId: item.id,
                cctvName: item.name,
                region: item.region,
                type: item.type,
                severity: STATUS_EVENT_MAP[item.status].severity,
                message: STATUS_EVENT_MAP[item.status].message,
                time: new Date(),
            }));
        },
        [items]
    );

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
