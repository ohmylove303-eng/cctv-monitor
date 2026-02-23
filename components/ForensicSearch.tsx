'use client';
import { useState, useCallback } from 'react';
import { CctvItem } from '@/types/cctv';

// ─── 검색 조건 타입 ──────────────────────────────────────────────────────────
export interface ForensicSearchQuery {
    licensePlate: string;       // 차량번호
    vehicleModel: string;       // 차량 모델/색상
    upperClothing: string;      // 상의 종류/색상
    lowerClothing: string;      // 하의 종류/색상
    hat: string;                // 모자 착용 여부/색상
    faceShape: string;          // 얼굴형
    timeFrom: string;           // 검색 시작 시각
    timeTo: string;             // 검색 종료 시각
}

interface SearchHit {
    id: string;
    cctvId: string;
    cctvName: string;
    region: string;
    timestamp: string;
    matchFields: string[];
    confidence: number;
    frameHash: string;
    thumbnail: string;          // emoji placeholder
}

interface Props {
    allCctv: CctvItem[];
    onLocate: (cctvId: string) => void;
}

// ─── 옵션 목록 ───────────────────────────────────────────────────────────────
const VEHICLE_MODELS = ['선택 안함', '승용차(세단)', 'SUV', '트럭', '버스', '오토바이', '밴', '택시', '경찰차', '소방차'];
const COLORS = ['선택 안함', '검정', '흰색', '은색', '회색', '빨강', '파랑', '노랑', '초록', '주황', '갈색'];
const UPPER_TYPES = ['선택 안함', '티셔츠', '후드', '재킷', '점퍼', '코트', '정장', '조끼', '넥타이'];
const LOWER_TYPES = ['선택 안함', '청바지', '슬랙스', '반바지', '치마', '레깅스', '조거팬츠'];
const HAT_TYPES = ['선택 안함', '미착용', '야구모자', '비니', '모자(챙)', '후드', '헬멧', '선글라스'];
const FACE_SHAPES = ['선택 안함', '둥근형', '각진형', '타원형', '긴형', '하트형', '역삼각형'];

const EMPTY_QUERY: ForensicSearchQuery = {
    licensePlate: '', vehicleModel: '', upperClothing: '',
    lowerClothing: '', hat: '', faceShape: '',
    timeFrom: '2026-02-24T00:00', timeTo: '2026-02-24T01:42',
};

// ─── 더미 결과 생성기 (MFSR 규칙 기반 시뮬레이션) ────────────────────────────
function simulateSearch(q: ForensicSearchQuery, cams: CctvItem[]): SearchHit[] {
    const activeFields: string[] = [];
    if (q.licensePlate.trim()) activeFields.push(`차량번호 "${q.licensePlate.trim()}"`);
    if (q.vehicleModel && q.vehicleModel !== '선택 안함') activeFields.push(`차종 ${q.vehicleModel}`);
    if (q.upperClothing && q.upperClothing !== '선택 안함') activeFields.push(`상의 ${q.upperClothing}`);
    if (q.lowerClothing && q.lowerClothing !== '선택 안함') activeFields.push(`하의 ${q.lowerClothing}`);
    if (q.hat && q.hat !== '선택 안함') activeFields.push(`모자 ${q.hat}`);
    if (q.faceShape && q.faceShape !== '선택 안함') activeFields.push(`얼굴형 ${q.faceShape}`);
    if (!activeFields.length) return [];

    // 연결된 카메라 중심으로 결과 생성 (최대 8건)
    const pool = cams.filter(c => c.status !== '고장');
    const hits: SearchHit[] = [];
    const count = Math.min(pool.length, 3 + Math.floor(Math.random() * 5));

    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, count);
    shuffled.forEach((cam, i) => {
        const minutesAgo = 5 + Math.floor(Math.random() * 85);
        const ts = new Date(new Date('2026-02-24T01:42:00+09:00').getTime() - minutesAgo * 60000);
        const conf = 72 + Math.floor(Math.random() * 25);
        const h = () => Math.random().toString(16).slice(2, 10).padEnd(8, '0');
        const icons = ['🚗', '👤', '🚙', '🏃', '🚕', '👮'];
        hits.push({
            id: `HIT-${String(i + 1).padStart(3, '0')}`,
            cctvId: cam.id,
            cctvName: cam.name,
            region: cam.region,
            timestamp: ts.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
            matchFields: activeFields.slice(0, 2 + Math.floor(Math.random() * (activeFields.length - 1))),
            confidence: conf,
            frameHash: h(),
            thumbnail: icons[Math.floor(Math.random() * icons.length)],
        });
    });

    return hits.sort((a, b) => b.confidence - a.confidence);
}

// ─── SelectRow 헬퍼 ──────────────────────────────────────────────────────────
function SelectRow({ label, value, options, onChange }: {
    label: string; value: string; options: string[];
    onChange: (v: string) => void;
}) {
    return (
        <div style={{ marginBottom: 8 }}>
            <div style={{
                fontSize: 9, color: '#475569', marginBottom: 3,
                fontWeight: 700, letterSpacing: '0.06em'
            }}>{label}</div>
            <select value={value} onChange={e => onChange(e.target.value)}
                style={{
                    width: '100%', padding: '6px 8px', borderRadius: 5,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: value && value !== '선택 안함' ? '#e2e8f0' : '#475569',
                    fontSize: 11, cursor: 'pointer',
                    appearance: 'none',
                }}>
                {options.map(o => <option key={o} value={o} style={{ background: '#0d1630', color: '#e2e8f0' }}>{o}</option>)}
            </select>
        </div>
    );
}

function ColorRow({ label, colorKey, query, setQuery }: {
    label: string; colorKey: string;
    query: Record<string, string>; setQuery: (q: Record<string, string>) => void;
}) {
    return (
        <div style={{ marginBottom: 6 }}>
            <div style={{
                fontSize: 9, color: '#475569', marginBottom: 3,
                fontWeight: 700, letterSpacing: '0.06em'
            }}>{label} 색상</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {COLORS.map(c => {
                    const colorMap: Record<string, string> = {
                        '검정': '#1f2937', '흰색': '#f1f5f9', '은색': '#94a3b8',
                        '회색': '#64748b', '빨강': '#ef4444', '파랑': '#3b82f6',
                        '노랑': '#eab308', '초록': '#22c55e', '주황': '#f97316',
                        '갈색': '#92400e', '선택 안함': 'transparent',
                    };
                    const bg = colorMap[c] ?? '#374151';
                    const selected = query[colorKey] === c;
                    if (c === '선택 안함') return null;
                    return (
                        <button key={c} title={c}
                            onClick={() => setQuery({ ...query, [colorKey]: selected ? '' : c })}
                            style={{
                                width: 20, height: 20, borderRadius: 4,
                                background: bg, border: `2px solid ${selected ? '#40c4ff' : 'rgba(255,255,255,0.12)'}`,
                                cursor: 'pointer',
                                boxShadow: selected ? '0 0 6px rgba(64,196,255,0.7)' : 'none',
                                transition: 'all 0.12s',
                            }} />
                    );
                })}
            </div>
        </div>
    );
}

export default function ForensicSearch({ allCctv, onLocate }: Props) {
    const [query, setQuery] = useState<ForensicSearchQuery>(EMPTY_QUERY);
    const [colorMap, setColorMap] = useState<Record<string, string>>({});
    const [results, setResults] = useState<SearchHit[] | null>(null);
    const [searching, setSearching] = useState(false);
    const [selectedHit, setSelectedHit] = useState<string | null>(null);

    const handleSearch = useCallback(async () => {
        const mergedQuery: ForensicSearchQuery = {
            ...query,
            vehicleModel: colorMap.vehicle ? `${query.vehicleModel} (${colorMap.vehicle})` : query.vehicleModel,
            upperClothing: colorMap.upper ? `${query.upperClothing} (${colorMap.upper})` : query.upperClothing,
            lowerClothing: colorMap.lower ? `${query.lowerClothing} (${colorMap.lower})` : query.lowerClothing,
        };
        setSearching(true);
        setResults(null);
        await new Promise(r => setTimeout(r, 1400));
        setResults(simulateSearch(mergedQuery, allCctv));
        setSearching(false);
    }, [query, colorMap, allCctv]);

    const hasQuery = query.licensePlate.trim() ||
        [query.vehicleModel, query.upperClothing, query.lowerClothing, query.hat, query.faceShape]
            .some(v => v && v !== '선택 안함');

    return (
        <div className="glass-panel" style={{
            borderRadius: 12, display: 'flex', flexDirection: 'column',
            overflow: 'hidden', minHeight: 0, height: '100%',
        }}>
            {/* 헤더 */}
            <div style={{
                padding: '11px 14px',
                borderBottom: '1px solid var(--border-glass)',
                background: 'rgba(13,25,48,0.9)', flexShrink: 0
            }}>
                <div style={{
                    fontSize: 11, fontWeight: 800, color: '#40c4ff',
                    letterSpacing: '0.08em', textShadow: '0 0 10px rgba(64,196,255,0.4)'
                }}>
                    🔍 포렌식 통합 검색
                </div>
                <div style={{ fontSize: 9, color: '#334155', marginTop: 2 }}>
                    MFSR 규칙 기반 · 생성형 AI 배제
                </div>
            </div>

            {/* 검색 폼 */}
            <div style={{
                overflowY: 'auto', padding: '12px 13px',
                display: 'flex', flexDirection: 'column', gap: 0, flex: 1, minHeight: 0
            }}>

                {/* 검색 시간 범위 */}
                <SectionLabel icon="🕐" label="검색 시간 범위" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
                    {['시작', '종료'].map((lbl, i) => (
                        <div key={lbl}>
                            <div style={{
                                fontSize: 9, color: '#475569', marginBottom: 3,
                                fontWeight: 700, letterSpacing: '0.06em'
                            }}>{lbl}</div>
                            <input type="datetime-local"
                                value={i === 0 ? query.timeFrom : query.timeTo}
                                onChange={e => setQuery({ ...query, [i === 0 ? 'timeFrom' : 'timeTo']: e.target.value })}
                                style={{
                                    width: '100%', padding: '5px 7px', borderRadius: 5,
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.09)',
                                    color: '#94a3b8', fontSize: 10
                                }} />
                        </div>
                    ))}
                </div>

                {/* 차량 검색 */}
                <SectionLabel icon="🚗" label="차량 검색" />
                <div style={{ marginBottom: 8 }}>
                    <div style={{
                        fontSize: 9, color: '#475569', marginBottom: 3,
                        fontWeight: 700, letterSpacing: '0.06em'
                    }}>차량번호 (전체 또는 일부)</div>
                    <input
                        type="text" placeholder="예: 12가 3456 · 일부 입력 가능"
                        value={query.licensePlate}
                        onChange={e => setQuery({ ...query, licensePlate: e.target.value })}
                        style={{
                            width: '100%', padding: '6px 9px', borderRadius: 5,
                            background: 'rgba(255,255,255,0.05)',
                            border: `1px solid ${query.licensePlate ? 'rgba(64,196,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                            color: '#e2e8f0', fontSize: 11,
                            fontFamily: 'JetBrains Mono, monospace',
                            outline: 'none',
                        }} />
                </div>
                <SelectRow label="차종" value={query.vehicleModel}
                    options={VEHICLE_MODELS}
                    onChange={v => setQuery({ ...query, vehicleModel: v })} />
                <ColorRow label="차량" colorKey="vehicle" query={colorMap} setQuery={setColorMap as unknown as (q: Record<string, string>) => void} />

                <Divider />

                {/* 인물 검색 */}
                <SectionLabel icon="👤" label="인물 검색" />
                <SelectRow label="상의 종류" value={query.upperClothing}
                    options={UPPER_TYPES}
                    onChange={v => setQuery({ ...query, upperClothing: v })} />
                <ColorRow label="상의" colorKey="upper" query={colorMap} setQuery={setColorMap as unknown as (q: Record<string, string>) => void} />

                <SelectRow label="하의 종류" value={query.lowerClothing}
                    options={LOWER_TYPES}
                    onChange={v => setQuery({ ...query, lowerClothing: v })} />
                <ColorRow label="하의" colorKey="lower" query={colorMap} setQuery={setColorMap as unknown as (q: Record<string, string>) => void} />

                <SelectRow label="모자 착용" value={query.hat}
                    options={HAT_TYPES}
                    onChange={v => setQuery({ ...query, hat: v })} />

                <Divider />

                {/* 얼굴형 */}
                <SectionLabel icon="😐" label="얼굴형 검색" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, marginBottom: 10 }}>
                    {FACE_SHAPES.filter(f => f !== '선택 안함').map(face => (
                        <button key={face}
                            onClick={() => setQuery({ ...query, faceShape: query.faceShape === face ? '' : face })}
                            style={{
                                padding: '5px 4px', borderRadius: 6, fontSize: 10,
                                fontWeight: query.faceShape === face ? 800 : 500,
                                cursor: 'pointer', border: `1px solid`,
                                borderColor: query.faceShape === face ? 'rgba(64,196,255,0.5)' : 'rgba(255,255,255,0.08)',
                                background: query.faceShape === face ? 'rgba(64,196,255,0.12)' : 'rgba(255,255,255,0.03)',
                                color: query.faceShape === face ? '#40c4ff' : '#64748b',
                                transition: 'all 0.12s',
                            }}>
                            {face}
                        </button>
                    ))}
                </div>

                {/* 검색 버튼 */}
                <button
                    disabled={!hasQuery || searching}
                    onClick={handleSearch}
                    style={{
                        width: '100%', padding: '9px', borderRadius: 7,
                        background: hasQuery && !searching ? 'rgba(64,196,255,0.14)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${hasQuery && !searching ? 'rgba(64,196,255,0.4)' : 'rgba(255,255,255,0.07)'}`,
                        color: hasQuery && !searching ? '#40c4ff' : '#334155',
                        fontWeight: 800, cursor: hasQuery && !searching ? 'pointer' : 'not-allowed',
                        fontSize: 12, letterSpacing: '0.04em',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                        transition: 'all 0.15s',
                    }}>
                    {searching ? (
                        <><div style={{
                            width: 14, height: 14, border: '2px solid #40c4ff',
                            borderTopColor: 'transparent', borderRadius: '50%',
                            animation: 'spin 0.7s linear infinite'
                        }} /> MFSR 분석중…</>
                    ) : '🔍 포렌식 검색 실행'}
                </button>

                {/* 초기화 */}
                {hasQuery && !searching && (
                    <button onClick={() => { setQuery(EMPTY_QUERY); setColorMap({}); setResults(null); }}
                        style={{
                            width: '100%', marginTop: 5, padding: '6px',
                            borderRadius: 6, background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.06)',
                            color: '#334155', fontSize: 10, cursor: 'pointer',
                        }}>
                        조건 초기화
                    </button>
                )}

                {/* 결과 */}
                {results !== null && (
                    <div style={{ marginTop: 12 }}>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between',
                            alignItems: 'center', marginBottom: 7
                        }}>
                            <span style={{ fontSize: 10, color: '#40c4ff', fontWeight: 800 }}>
                                🎯 검색 결과 {results.length}건
                            </span>
                            {results.length > 0 && (
                                <span style={{ fontSize: 9, color: '#334155' }}>
                                    신뢰도 순
                                </span>
                            )}
                        </div>
                        {results.length === 0 ? (
                            <div style={{
                                textAlign: 'center', padding: '20px 0',
                                color: '#334155', fontSize: 11
                            }}>
                                일치하는 영상 없음<br />
                                <span style={{ fontSize: 9, color: '#1e293b' }}>조건을 변경하거나 시간범위를 조정하세요</span>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {results.map(hit => (
                                    <div key={hit.id}
                                        onClick={() => { setSelectedHit(hit.id); onLocate(hit.cctvId); }}
                                        style={{
                                            padding: '9px 10px', borderRadius: 8, cursor: 'pointer',
                                            background: selectedHit === hit.id
                                                ? 'rgba(64,196,255,0.1)' : 'rgba(255,255,255,0.03)',
                                            border: `1px solid ${selectedHit === hit.id
                                                ? 'rgba(64,196,255,0.35)' : 'rgba(255,255,255,0.06)'}`,
                                            transition: 'all 0.15s',
                                        }}>
                                        <div style={{
                                            display: 'flex', justifyContent: 'space-between',
                                            alignItems: 'flex-start', marginBottom: 4
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ fontSize: 20 }}>{hit.thumbnail}</span>
                                                <div>
                                                    <div style={{
                                                        fontSize: 10, fontWeight: 700, color: '#cbd5e1',
                                                        lineHeight: 1.3, maxWidth: 130, overflow: 'hidden',
                                                        textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                                    }}>
                                                        {hit.cctvName}
                                                    </div>
                                                    <div style={{
                                                        fontSize: 9, color: '#334155',
                                                        fontFamily: 'monospace'
                                                    }}>{hit.cctvId}</div>
                                                </div>
                                            </div>
                                            {/* 신뢰도 게이지 */}
                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                <div style={{
                                                    fontSize: 13, fontWeight: 800,
                                                    color: hit.confidence >= 90 ? '#22c55e'
                                                        : hit.confidence >= 80 ? '#40c4ff' : '#f59e0b'
                                                }}>
                                                    {hit.confidence}%
                                                </div>
                                                <div style={{
                                                    width: 40, height: 3, background: 'rgba(255,255,255,0.08)',
                                                    borderRadius: 2, marginTop: 2
                                                }}>
                                                    <div style={{
                                                        height: '100%', borderRadius: 2,
                                                        width: `${hit.confidence}%`,
                                                        background: hit.confidence >= 90 ? '#22c55e'
                                                            : hit.confidence >= 80 ? '#40c4ff' : '#f59e0b',
                                                        boxShadow: `0 0 4px ${hit.confidence >= 80 ? '#40c4ff' : '#f59e0b'}`,
                                                    }} />
                                                </div>
                                            </div>
                                        </div>
                                        {/* 매칭 필드 */}
                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                                            {hit.matchFields.map(f => (
                                                <span key={f} style={{
                                                    fontSize: 8, padding: '1px 5px', borderRadius: 3,
                                                    background: 'rgba(64,196,255,0.1)',
                                                    border: '1px solid rgba(64,196,255,0.2)',
                                                    color: '#40c4ff',
                                                }}>{f}</span>
                                            ))}
                                        </div>
                                        <div style={{
                                            display: 'flex', justifyContent: 'space-between',
                                            fontSize: 9, color: '#334155'
                                        }}>
                                            <span>📍 {hit.region}</span>
                                            <span>🕐 {hit.timestamp}</span>
                                            <span style={{
                                                fontFamily: 'monospace',
                                                color: '#1e293b'
                                            }}>#{hit.frameHash}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── 소형 헬퍼 컴포넌트 ──────────────────────────────────────────────────────
function SectionLabel({ icon, label }: { icon: string; label: string }) {
    return (
        <div style={{
            fontSize: 9, color: '#818cf8', fontWeight: 800,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5
        }}>
            {icon} {label}
        </div>
    );
}

function Divider() {
    return <div style={{
        borderTop: '1px solid rgba(255,255,255,0.05)',
        margin: '10px 0 8px'
    }} />;
}
