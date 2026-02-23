'use client';
import { useState } from 'react';
import { CctvItem, CctvType } from '@/types/cctv';
import ForensicModal from './ForensicModal';

const TYPE_CFG: Record<CctvType, { label: string; color: string; icon: string }> = {
    crime: { label: '방범 CCTV', color: '#60a5fa', icon: '📷' },
    fire: { label: '소방 CCTV', color: '#f87171', icon: '🚒' },
    traffic: { label: '교통 CCTV', color: '#34d399', icon: '🚦' },
};
const STATUS_COLOR: Record<string, string> = {
    '정상': '#22c55e', '점검중': '#f59e0b', '고장': '#ef4444',
};
const REGION_COLOR: Record<string, string> = {
    '김포': '#10b981', '인천': '#06b6d4',
};

interface Props { cctv: CctvItem; onClose: () => void; }

export default function CctvModal({ cctv, onClose }: Props) {
    const [showForensic, setShowForensic] = useState(false);
    const cfg = TYPE_CFG[cctv.type];

    return (
        <>
            <div onClick={onClose} style={{
                position: 'fixed', inset: 0, background: 'rgba(2,6,17,0.8)',
                backdropFilter: 'blur(10px)', zIndex: 9000,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            }}>
                <div onClick={e => e.stopPropagation()}
                    className="glass-panel"
                    style={{
                        borderRadius: 16, width: '100%', maxWidth: 460, overflow: 'hidden',
                        boxShadow: `0 0 40px ${cfg.color}22`,
                        border: `1px solid ${cfg.color}33`
                    }}>

                    {/* 헤더 */}
                    <div style={{
                        padding: '13px 16px',
                        background: `linear-gradient(135deg, ${cfg.color}10, ${cfg.color}22)`,
                        borderBottom: `1px solid ${cfg.color}30`,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'
                    }}>
                        <div>
                            <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                                <span className="badge" style={{
                                    color: cfg.color, background: `${cfg.color}18`,
                                    borderColor: `${cfg.color}35`
                                }}>
                                    {cfg.icon} {cfg.label}
                                </span>
                                <span className="badge" style={{
                                    color: REGION_COLOR[cctv.region],
                                    background: `${REGION_COLOR[cctv.region]}15`,
                                    borderColor: `${REGION_COLOR[cctv.region]}30`
                                }}>
                                    📍 {cctv.region} · {cctv.district}
                                </span>
                                <span className="badge" style={{
                                    color: STATUS_COLOR[cctv.status],
                                    background: `${STATUS_COLOR[cctv.status]}15`,
                                    borderColor: `${STATUS_COLOR[cctv.status]}30`
                                }}>
                                    ● {cctv.status}
                                </span>
                            </div>
                            <h3 style={{
                                color: 'white', fontSize: 14, fontWeight: 800,
                                margin: 0, letterSpacing: '0.02em'
                            }}>
                                {cctv.name}
                            </h3>
                        </div>
                        <button onClick={onClose} style={{
                            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
                            color: '#64748b', width: 28, height: 28, borderRadius: '50%',
                            cursor: 'pointer', fontSize: 16, display: 'flex',
                            alignItems: 'center', justifyContent: 'center', flexShrink: 0
                        }}>✕</button>
                    </div>

                    {/* 영상 뷰어 */}
                    <div style={{
                        background: '#000', aspectRatio: '16/9', position: 'relative',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        {cctv.streamUrl ? (
                            <>
                                <iframe src={cctv.streamUrl} style={{ width: '100%', height: '100%', border: 'none' }}
                                    allow="autoplay; fullscreen" title={cctv.name} />
                                <div style={{
                                    position: 'absolute', top: 8, left: 8,
                                    background: '#ef4444', color: 'white', fontSize: 9,
                                    fontWeight: 800, padding: '2px 8px', borderRadius: 4,
                                    letterSpacing: '0.1em'
                                }}>
                                    ● LIVE
                                </div>
                            </>
                        ) : (
                            <div style={{ textAlign: 'center', color: '#334155' }}>
                                <div style={{
                                    fontSize: 36, marginBottom: 8,
                                    backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 2px,
                    rgba(255,255,255,0.015) 2px, rgba(255,255,255,0.015) 4px)`,
                                    position: 'absolute', inset: 0
                                }} />
                                <div style={{ position: 'relative', zIndex: 1 }}>
                                    <div style={{ fontSize: 36, marginBottom: 8 }}>{cfg.icon}</div>
                                    <div style={{ fontSize: 12, color: '#475569' }}>스트림 미연결</div>
                                    <div style={{ fontSize: 10, marginTop: 4, color: '#334155' }}>
                                        streamUrl 필드에 HLS/YouTube 주소 입력
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 상세정보 */}
                    <div style={{ padding: '13px 15px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 9 }}>
                            {[
                                { label: 'CCTV ID', value: cctv.id },
                                { label: '해상도', value: cctv.resolution ?? '-' },
                                { label: '설치연도', value: cctv.installedYear ? `${cctv.installedYear}년` : '-' },
                                { label: '관리기관', value: cctv.operator },
                            ].map(item => (
                                <div key={item.label} style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7, padding: '7px 10px'
                                }}>
                                    <div style={{ fontSize: 9, color: '#475569', marginBottom: 2 }}>{item.label}</div>
                                    <div style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 700 }}>{item.value}</div>
                                </div>
                            ))}
                        </div>

                        {/* 위치 */}
                        <div style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.07)',
                            borderRadius: 7, padding: '8px 10px', marginBottom: 9
                        }}>
                            <div style={{ fontSize: 9, color: '#475569', marginBottom: 3 }}>설치위치</div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 5 }}>{cctv.address}</div>
                            <div style={{ display: 'flex', gap: 16 }}>
                                <span style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace' }}>
                                    LAT {cctv.lat.toFixed(6)}
                                </span>
                                <span style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace' }}>
                                    LNG {cctv.lng.toFixed(6)}
                                </span>
                            </div>
                        </div>

                        {/* 포렌식 버튼 */}
                        <button className="btn-forensic" onClick={() => setShowForensic(true)}
                            style={{
                                width: '100%', padding: '9px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7
                            }}>
                            ⚗ 포렌식 분석 (MFSR) — 생성형 AI 전면 배제
                        </button>

                        <button onClick={onClose} style={{
                            width: '100%', marginTop: 7, padding: '8px',
                            background: `${cfg.color}18`, color: cfg.color,
                            border: `1px solid ${cfg.color}35`, borderRadius: 6,
                            fontWeight: 700, cursor: 'pointer', fontSize: 12
                        }}>
                            닫기
                        </button>
                    </div>
                </div>
            </div>

            {showForensic && (
                <ForensicModal cctv={cctv} onClose={() => setShowForensic(false)} />
            )}
        </>
    );
}
