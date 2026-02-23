'use client';

import { ForensicEvent } from '@/types';
import {
    getSeverityColor,
    getSeverityLabel,
    getEventTypeLabel,
    timeAgo,
} from '@/lib/utils';

interface Props {
    events: ForensicEvent[];
    onAcknowledge?: (id: string) => void;
}

export default function EventPanel({ events, onAcknowledge }: Props) {
    const unacked = events.filter((e) => !e.acknowledged);
    const acked = events.filter((e) => e.acknowledged);
    const sorted = [...unacked, ...acked];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <div
                style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexShrink: 0,
                }}
            >
                <h3 style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
                    포렌식 이벤트
                </h3>
                {unacked.length > 0 && (
                    <span
                        style={{
                            background: '#ef4444',
                            color: '#fff',
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '1px 8px',
                            borderRadius: 9999,
                        }}
                    >
                        {unacked.length}
                    </span>
                )}
            </div>

            {/* MFSR Notice */}
            <div
                style={{
                    margin: '10px 12px 0',
                    padding: '7px 10px',
                    background: 'rgba(59,130,246,0.07)',
                    border: '1px solid rgba(59,130,246,0.2)',
                    borderRadius: 7,
                    fontSize: 10,
                    color: '#60a5fa',
                    lineHeight: 1.5,
                    flexShrink: 0,
                }}
            >
                MFSR 룰셋 엔진 v2.4.1 | 생성형 AI 판단 배제 | 알고리즘 기반 탐지만 사용
            </div>

            {/* Event List */}
            <div
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                }}
            >
                {sorted.map((e) => {
                    const sColor = getSeverityColor(e.severity);
                    return (
                        <div
                            key={e.id}
                            style={{
                                background: e.acknowledged
                                    ? 'rgba(255,255,255,0.02)'
                                    : `${sColor}11`,
                                border: `1px solid ${e.acknowledged ? 'rgba(255,255,255,0.06)' : `${sColor}44`}`,
                                borderRadius: 8,
                                padding: '10px 12px',
                                opacity: e.acknowledged ? 0.55 : 1,
                                transition: 'all 0.2s',
                            }}
                        >
                            {/* Top row */}
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: 5,
                                    gap: 4,
                                }}
                            >
                                <span
                                    style={{
                                        fontSize: 10,
                                        fontWeight: 700,
                                        color: sColor,
                                        background: `${sColor}22`,
                                        padding: '1px 7px',
                                        borderRadius: 4,
                                    }}
                                >
                                    {getSeverityLabel(e.severity)}
                                </span>
                                <span style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace' }}>
                                    {e.ruleId}
                                </span>
                            </div>

                            {/* Event type + camera */}
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 3 }}>
                                {getEventTypeLabel(e.type)}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
                                📍 {e.cameraName} ({e.region})
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, lineHeight: 1.4 }}>
                                {e.description}
                            </div>

                            {/* Bottom row */}
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                }}
                            >
                                <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#475569' }}>
                                    <span>신뢰도 {e.confidence}%</span>
                                    <span>·</span>
                                    <span>{timeAgo(e.timestamp)}</span>
                                </div>
                                {!e.acknowledged && onAcknowledge && (
                                    <button
                                        onClick={() => onAcknowledge(e.id)}
                                        style={{
                                            fontSize: 10,
                                            padding: '2px 8px',
                                            background: 'rgba(255,255,255,0.07)',
                                            border: '1px solid rgba(255,255,255,0.15)',
                                            borderRadius: 4,
                                            color: '#94a3b8',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        확인
                                    </button>
                                )}
                                {e.acknowledged && (
                                    <span style={{ fontSize: 10, color: '#22c55e' }}>✓ {e.acknowledgedBy}</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
