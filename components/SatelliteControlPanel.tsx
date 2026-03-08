'use client';

export type SatelliteMode = 'off' | 'gk2a' | 'sentinel' | 'planet';

interface Props {
    mode: SatelliteMode;
    onModeChange: (m: SatelliteMode) => void;
    opacity: number;
    onOpacityChange: (v: number) => void;
    sentinelDate: string;
    onSentinelDateChange: (d: string) => void;
    lastUpdated: string | null;
    isLoading: boolean;
}

const MODES: { key: SatelliteMode; label: string }[] = [
    { key: 'off', label: 'OFF' },
    { key: 'gk2a', label: 'GK2A' },
    { key: 'sentinel', label: 'S2' },
    { key: 'planet', label: 'Planet' },
];

export default function SatelliteControlPanel({
    mode,
    onModeChange,
    opacity,
    onOpacityChange,
    sentinelDate,
    onSentinelDateChange,
    lastUpdated,
    isLoading,
}: Props) {
    return (
        <div
            className="w-64 rounded-lg p-3 text-xs"
            style={{
                position: 'absolute',
                top: 10,
                right: 10,
                zIndex: 30,
                background: 'rgba(10,18,40,0.92)',
                border: '1px solid rgba(64,196,255,0.25)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
            }}
        >
            {/* 헤더 */}
            <div
                style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: '#40c4ff',
                    letterSpacing: '0.08em',
                    marginBottom: 8,
                    textShadow: '0 0 10px rgba(64,196,255,0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                }}
            >
                🛰 위성 영상
            </div>

            {/* 모드 버튼 */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                {MODES.map(({ key, label }) => (
                    <button
                        key={key}
                        onClick={() => onModeChange(key)}
                        style={{
                            flex: 1,
                            padding: '5px 0',
                            borderRadius: 5,
                            fontSize: 10,
                            fontWeight: mode === key ? 800 : 500,
                            cursor: 'pointer',
                            background:
                                mode === key
                                    ? key === 'off'
                                        ? 'rgba(100,116,139,0.3)'
                                        : 'rgba(6,182,212,0.25)'
                                    : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${mode === key
                                ? key === 'off'
                                    ? 'rgba(100,116,139,0.5)'
                                    : 'rgba(64,196,255,0.55)'
                                : 'rgba(255,255,255,0.08)'
                                }`,
                            color:
                                mode === key
                                    ? key === 'off'
                                        ? '#94a3b8'
                                        : '#40c4ff'
                                    : '#475569',
                            transition: 'all 0.15s',
                        }}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* 투명도 슬라이더 (OFF가 아닐 때) */}
            {mode !== 'off' && (
                <div style={{ marginBottom: 8 }}>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 4,
                        }}
                    >
                        <span style={{ fontSize: 9, color: '#64748b', fontWeight: 700, letterSpacing: '0.06em' }}>
                            투명도
                        </span>
                        <span style={{ fontSize: 10, color: '#40c4ff', fontWeight: 700 }}>
                            {opacity}%
                        </span>
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={opacity}
                        onChange={(e) => onOpacityChange(Number(e.target.value))}
                        style={{
                            width: '100%',
                            accentColor: '#40c4ff',
                            cursor: 'pointer',
                        }}
                    />
                </div>
            )}

            {/* Sentinel 날짜 선택 (mode=sentinel일 때만) */}
            {mode === 'sentinel' && (
                <div style={{ marginBottom: 8 }}>
                    <div
                        style={{
                            fontSize: 9,
                            color: '#64748b',
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            marginBottom: 4,
                        }}
                    >
                        날짜 (Sentinel-2)
                    </div>
                    <input
                        type="date"
                        value={sentinelDate}
                        onChange={(e) => onSentinelDateChange(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '5px 7px',
                            borderRadius: 5,
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(64,196,255,0.3)',
                            color: '#94a3b8',
                            fontSize: 10,
                            outline: 'none',
                        }}
                    />
                </div>
            )}

            {/* GK2A 갱신 시각 표시 */}
            {mode === 'gk2a' && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 9,
                        color: '#475569',
                    }}
                >
                    <span>갱신:</span>
                    <span style={{ color: lastUpdated ? '#22c55e' : '#334155' }}>
                        {lastUpdated ?? '대기중'}
                    </span>
                    {isLoading && (
                        <span
                            style={{
                                display: 'inline-block',
                                animation: 'spin 0.8s linear infinite',
                                color: '#40c4ff',
                                fontSize: 11,
                            }}
                        >
                            ⟳
                        </span>
                    )}
                </div>
            )}

            {/* API 키 없을 때 안내 (mode !== off, opacity 슬라이더 아래) */}
            {mode === 'planet' && (
                <div style={{ fontSize: 9, color: '#334155', marginTop: 4 }}>
                    * PLANET_API_KEY 필요
                </div>
            )}

            {mode === 'gk2a' && (
                <div style={{ fontSize: 9, color: '#334155', marginTop: 4 }}>
                    * KMA_API_KEY 필요 · 2분 자동 갱신
                </div>
            )}
        </div>
    );
}
