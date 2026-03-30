'use client';

export type SatelliteMode = 'off' | 'sentinel' | 'planet';

interface Props {
    mode: SatelliteMode;
    onModeChange: (m: SatelliteMode) => void;
    availableModes?: SatelliteMode[];
    opacity: number;
    onOpacityChange: (v: number) => void;
    sentinelDate: string;
    onSentinelDateChange: (d: string) => void;
    lastUpdated: string | null;
    isLoading: boolean;
    errorMessage: string | null;
}

const MODES: { key: SatelliteMode; label: string }[] = [
    { key: 'off', label: 'OFF' },
    { key: 'sentinel', label: 'S2' },
    { key: 'planet', label: 'SKY' },
];

const MODE_TITLES: Record<Exclude<SatelliteMode, 'off'>, string> = {
    sentinel: 'Sentinel-2',
    planet: 'Planet SkySat',
};

function formatLastUpdated(value: string | null) {
    if (!value) return '대기중';
    return value.includes('T') ? value.replace('T', ' ').slice(0, 16) : value;
}

export default function SatelliteControlPanel({
    mode,
    onModeChange,
    availableModes = ['off', 'sentinel'],
    opacity,
    onOpacityChange,
    sentinelDate,
    onSentinelDateChange,
    lastUpdated,
    isLoading,
    errorMessage,
}: Props) {
    const activeTitle = mode === 'off' ? 'Satellite' : MODE_TITLES[mode];

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
                🛰 {activeTitle}
            </div>

            {/* 모드 버튼 */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                {MODES.filter(({ key }) => availableModes.includes(key)).map(({ key, label }) => (
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

            {/* 날짜 선택 */}
            {mode !== 'off' && (
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
                        날짜 ({activeTitle})
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

            {/* 갱신 정보 */}
            {mode !== 'off' && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 9,
                        color: '#475569',
                    }}
                >
                    <span>기준:</span>
                    <span style={{ color: lastUpdated ? '#22c55e' : '#334155' }}>
                        {formatLastUpdated(lastUpdated)}
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

            {mode === 'sentinel' && (
                <div
                    style={{
                        marginTop: 6,
                        fontSize: 9,
                        color: '#64748b',
                        lineHeight: 1.4,
                    }}
                >
                    줌 14 이상에서는 베이스맵 선명도 우선으로 Sentinel이 자동 숨김됩니다.
                </div>
            )}

            {mode !== 'off' && errorMessage && (
                <div
                    style={{
                        marginTop: 8,
                        padding: '8px 9px',
                        borderRadius: 6,
                        border: '1px solid rgba(248,113,113,0.28)',
                        background: 'rgba(127,29,29,0.18)',
                        color: '#fecaca',
                        fontSize: 9,
                        lineHeight: 1.5,
                    }}
                >
                    {activeTitle} 상태 이상
                    <div style={{ color: '#fca5a5', marginTop: 3 }}>{errorMessage}</div>
                </div>
            )}
        </div>
    );
}
