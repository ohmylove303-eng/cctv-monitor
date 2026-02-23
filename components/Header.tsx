'use client';

import { RegionStats, SystemStatus } from '@/types';

interface Props {
    stats: RegionStats[];
    system: SystemStatus;
    clock: string;
}

export default function Header({ stats, system, clock }: Props) {
    const totalCams = stats.reduce((a, s) => a + s.totalCameras, 0);
    const onlineCams = stats.reduce((a, s) => a + s.onlineCameras, 0);
    const alertCams = stats.reduce((a, s) => a + s.alertCameras, 0);
    const todayEvents = stats.reduce((a, s) => a + s.eventsToday, 0);
    const storagePercent = Math.round((system.storageUsed / system.storageTotal) * 100);

    return (
        <header
            style={{
                background: 'rgba(2,6,23,0.95)',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
                padding: '0 20px',
                height: 64,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
                backdropFilter: 'blur(16px)',
                zIndex: 100,
            }}
        >
            {/* Left: Branding */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div
                    style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 18,
                    }}
                >
                    📡
                </div>
                <div>
                    <div
                        style={{
                            fontSize: 15,
                            fontWeight: 800,
                            color: '#f1f5f9',
                            letterSpacing: '-0.02em',
                        }}
                    >
                        CCTV 통합 관제 상황실
                    </div>
                    <div
                        style={{
                            fontSize: 10,
                            color: '#475569',
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                        }}
                    >
                        김포 · 인천 | {system.mfsrEngineVersion}
                    </div>
                </div>
            </div>

            {/* Center: Stats */}
            <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                {[
                    { label: '전체 카메라', value: totalCams, color: '#64748b' },
                    { label: '운영중', value: onlineCams, color: '#22c55e' },
                    { label: '경보', value: alertCams, color: '#f59e0b' },
                    { label: '금일 이벤트', value: todayEvents, color: '#3b82f6' },
                ].map((s) => (
                    <div key={s.label} style={{ textAlign: 'center' }}>
                        <div
                            style={{
                                fontSize: 22,
                                fontWeight: 800,
                                color: s.color,
                                lineHeight: 1,
                                fontVariantNumeric: 'tabular-nums',
                            }}
                        >
                            {s.value}
                        </div>
                        <div style={{ fontSize: 9, color: '#475569', marginTop: 2, letterSpacing: '0.05em' }}>
                            {s.label}
                        </div>
                    </div>
                ))}

                {/* Storage */}
                <div style={{ textAlign: 'center', minWidth: 70 }}>
                    <div
                        style={{
                            height: 4,
                            background: 'rgba(255,255,255,0.1)',
                            borderRadius: 2,
                            overflow: 'hidden',
                            marginBottom: 4,
                        }}
                    >
                        <div
                            style={{
                                height: '100%',
                                width: `${storagePercent}%`,
                                background:
                                    storagePercent > 85
                                        ? '#ef4444'
                                        : storagePercent > 70
                                            ? '#f59e0b'
                                            : '#22c55e',
                                transition: 'width 0.5s',
                            }}
                        />
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                        {system.storageUsed}TB / {system.storageTotal}TB
                    </div>
                    <div style={{ fontSize: 9, color: '#475569', letterSpacing: '0.05em' }}>스토리지</div>
                </div>
            </div>

            {/* Right: Clock */}
            <div style={{ textAlign: 'right' }}>
                <div
                    style={{
                        fontSize: 22,
                        fontWeight: 700,
                        color: '#e2e8f0',
                        fontFamily: '"Courier New", monospace',
                        letterSpacing: '0.05em',
                    }}
                >
                    {clock}
                </div>
                <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>
                    대역폭 {system.networkBandwidth} Mbps · 세션 {system.activeSessions}
                </div>
            </div>
        </header>
    );
}
