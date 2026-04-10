import { CctvItem, CctvType, LayerVisibility, RegionFilter, RoadPreset, RouteDirection, RouteScopeMode } from '@/types/cctv';
import { SatelliteMode } from '@/components/SatelliteControlPanel';
import { matchesRoadPreset, ROAD_PRESET_OPTIONS } from '@/lib/road-presets';
import {
    hasLiveTrafficStream,
    isLiveTrafficSource,
    isMapOnlyTrafficCamera,
    isMapOnlyTrafficSource,
} from '@/lib/traffic-sources';

interface Props {
    allCctv: CctvItem[];
    hiddenApproximateCount: number;
    hiddenFlaggedCount: number;
    hiddenDuplicateCount: number;
    visible: LayerVisibility;
    regionFilter: RegionFilter;
    onVisibleChange: (v: LayerVisibility) => void;
    onRegionChange: (r: RegionFilter) => void;
    onSelect: (c: CctvItem) => void;
    onFlyTo: (c: CctvItem) => void;
    itsRoadOnly: boolean;
    onItsRoadOnlyChange: (v: boolean) => void;
    roadPreset: RoadPreset;
    onRoadPresetChange: (v: RoadPreset) => void;
    routeDirection: RouteDirection;
    onRouteDirectionChange: (v: RouteDirection) => void;
    routeSpeedKph: number;
    onRouteSpeedKphChange: (v: number) => void;
    routeScopeMode: RouteScopeMode;
    onRouteScopeModeChange: (v: RouteScopeMode) => void;
    routeStartQuery: string;
    onRouteStartQueryChange: (v: string) => void;
    routeDestinationQuery: string;
    onRouteDestinationQueryChange: (v: string) => void;
    routeScenarioName: string;
    onRouteScenarioNameChange: (v: string) => void;
    canSaveRouteScenario: boolean;
    onSaveRouteScenario: () => void;
    savedRouteScenarios: Array<{
        id: string;
        name: string;
        selectedCctvId?: string | null;
        roadPreset: RoadPreset;
        routeDirection: RouteDirection;
        routeSpeedKph: number;
        routeScopeMode: RouteScopeMode;
        routeStartQuery: string;
        routeDestinationQuery: string;
        createdAt?: string;
        updatedAt: string;
    }>;
    onLoadRouteScenario: (scenario: {
        id: string;
        name: string;
        selectedCctvId?: string | null;
        roadPreset: RoadPreset;
        routeDirection: RouteDirection;
        routeSpeedKph: number;
        routeScopeMode: RouteScopeMode;
        routeStartQuery: string;
        routeDestinationQuery: string;
        createdAt?: string;
        updatedAt: string;
    }) => void;
    onDeleteRouteScenario: (scenarioId: string) => void;
    onRouteStartSuggestionPreview?: (v: string) => void;
    onRouteDestinationSuggestionPreview?: (v: string) => void;
    onRouteSuggestionPreviewClear?: () => void;
    routeRoadLabel?: string;
    routeStartSuggestions?: Array<{
        id: string;
        name: string;
        region: CctvItem['region'];
        address: string;
        score: number;
        matchReason?: string;
        distanceKm?: number;
        previewSegmentCount?: number;
        previewMaxEtaMinutes?: number;
    }>;
    routePlanSummary?: {
        roadLabel: string;
        originLabel: string;
        startQuery: string;
        startMatched: boolean;
        startSuggestions: Array<{
            id: string;
            name: string;
            region: CctvItem['region'];
            address: string;
            score: number;
            matchReason?: string;
            distanceKm?: number;
            previewSegmentCount?: number;
            previewMaxEtaMinutes?: number;
        }>;
        destinationLabel: string | null;
        destinationQuery: string;
        destinationMatched: boolean;
        destinationSuggestions: Array<{
            id: string;
            name: string;
            region: CctvItem['region'];
            address: string;
            score: number;
            matchReason?: string;
            routeDistanceKm?: number;
            distanceKm?: number;
            etaMinutes?: number;
            timeWindowLabel?: string;
            previewSegmentCount?: number;
            previewMaxEtaMinutes?: number;
        }>;
        focusCount: number;
        highIdentificationCount: number;
        mediumIdentificationCount: number;
        bundleCount: number;
        segmentCount: number;
        directionLabel: string;
        directionSourceLabel: string;
        immediateCount: number;
        shortCount: number;
        mediumCount: number;
        scopeLabel: string;
    } | null;
    showMapOnlyTraffic: boolean;
    onShowMapOnlyTrafficChange: (v: boolean) => void;

    // 위성 레이어 제어 (VIBE MODE)
    satelliteMode: SatelliteMode;
    onSatelliteModeChange: (m: SatelliteMode) => void;
    availableSatelliteModes?: SatelliteMode[];
}

const TYPE_CFG: Record<CctvType, { label: string; icon: string; color: string; accent: string }> = {
    crime: { label: '방범 CCTV', icon: '📷', color: '#60a5fa', accent: 'badge-blue' },
    fire: { label: '소방 CCTV', icon: '🚒', color: '#f87171', accent: 'badge-red' },
    traffic: { label: '교통 CCTV', icon: '🚦', color: '#34d399', accent: 'badge-green' },
};

export default function SidePanel({
    hiddenApproximateCount,
    hiddenFlaggedCount,
    hiddenDuplicateCount,
    allCctv, visible, regionFilter,
    onVisibleChange, onRegionChange, onSelect, onFlyTo,
    itsRoadOnly, onItsRoadOnlyChange,
    roadPreset, onRoadPresetChange,
    routeDirection, onRouteDirectionChange,
    routeSpeedKph, onRouteSpeedKphChange,
    routeScopeMode, onRouteScopeModeChange,
    routeStartQuery, onRouteStartQueryChange,
    routeDestinationQuery, onRouteDestinationQueryChange,
    routeScenarioName, onRouteScenarioNameChange,
    canSaveRouteScenario, onSaveRouteScenario,
    savedRouteScenarios, onLoadRouteScenario, onDeleteRouteScenario,
    onRouteStartSuggestionPreview,
    onRouteDestinationSuggestionPreview,
    onRouteSuggestionPreviewClear,
    routeRoadLabel,
    routeStartSuggestions = [],
    routePlanSummary = null,
    showMapOnlyTraffic, onShowMapOnlyTrafficChange,
    satelliteMode, onSatelliteModeChange,
    availableSatelliteModes = ['off', 'sentinel'],
}: Props) {
    const liveTrafficCount = allCctv.filter(hasLiveTrafficStream).length;
    const mapOnlyTrafficCount = allCctv.filter(isMapOnlyTrafficCamera).length;
    const sourceRank = (cam: CctvItem) => {
        if (isLiveTrafficSource(cam.source)) {
            return 0;
        }
        if (isMapOnlyTrafficSource(cam.source)) {
            return 1;
        }
        return 2;
    };
    const filteredList = allCctv
        .filter(
            c => {
                if (!regionFilter[c.region]) return false;

                if (roadPreset !== 'all') {
                    return matchesRoadPreset(c, roadPreset) && hasLiveTrafficStream(c);
                }

                if (itsRoadOnly) {
                    return hasLiveTrafficStream(c);
                }

                if (!visible[c.type]) {
                    return false;
                }

                if (c.type === 'traffic' && !showMapOnlyTraffic) {
                    return hasLiveTrafficStream(c);
                }

                return true;
            }
        )
        .sort((a, b) =>
            sourceRank(a) - sourceRank(b)
            || a.region.localeCompare(b.region, 'ko')
            || a.name.localeCompare(b.name, 'ko')
        );

    const toggle = <K extends keyof LayerVisibility>(k: K) =>
        onVisibleChange({ ...visible, [k]: !visible[k] });

    const toggleRegion = <K extends keyof RegionFilter>(k: K) =>
        onRegionChange({ ...regionFilter, [k]: !regionFilter[k] });

    return (
        <div className="glass-panel" style={{
            borderRadius: 12, display: 'flex', flexDirection: 'column',
            overflow: 'hidden', minHeight: 0,
        }}>
            {/* 레이어 필터 */}
            <div style={{
                padding: '12px 14px', borderBottom: '1px solid var(--border-glass)',
                background: 'rgba(13,25,48,0.85)'
            }}>
                <div style={{
                    fontSize: 10, color: '#475569', fontWeight: 800,
                    letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 9
                }}>
                    📹 CCTV 레이어
                </div>

                {/* CCTV 종류 */}
                {(Object.keys(TYPE_CFG) as CctvType[]).map(type => {
                    const cfg = TYPE_CFG[type];
                    const cnt = allCctv.filter(c => c.type === type).length;
                    return (
                        <label key={type} style={{
                            display: 'flex', alignItems: 'center', gap: 9,
                            cursor: 'pointer', marginBottom: 7, padding: '5px 8px',
                            borderRadius: 7,
                            background: visible[type] ? `${cfg.color}10` : 'transparent',
                            border: `1px solid ${visible[type] ? cfg.color + '33' : 'transparent'}`,
                            transition: 'all 0.15s',
                        }}>
                            <input type="checkbox" checked={visible[type]}
                                onChange={() => toggle(type)}
                                style={{ accentColor: cfg.color, width: 15, height: 15, cursor: 'pointer' }} />
                            <span style={{ flex: 1, fontSize: 12, color: visible[type] ? '#e2e8f0' : '#475569' }}>
                                <span style={{ color: cfg.color }}>{cfg.icon}</span> {cfg.label}
                            </span>
                            <span style={{ fontSize: 10, color: '#334155' }}>{cnt}</span>
                        </label>
                    );
                })}

                {/* 지역 필터 */}
                <div style={{
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    marginTop: 8, paddingTop: 10
                }}>
                    <div style={{
                        fontSize: 9, color: '#334155', fontWeight: 700,
                        letterSpacing: '0.1em', marginBottom: 7
                    }}>
                        지역 필터
                    </div>
                    {(['김포', '인천', '서울'] as const).map(r => {
                        const rColor = r === '김포' ? '#10b981' : (r === '인천' ? '#06b6d4' : '#8b5cf6');
                        return (
                            <label key={r} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                cursor: 'pointer', marginBottom: 5, padding: '4px 6px',
                                borderRadius: 6,
                                background: regionFilter[r] ? `${rColor}10` : 'transparent',
                                border: `1px solid ${regionFilter[r] ? rColor + '33' : 'transparent'}`,
                            }}>
                                <input type="checkbox" checked={regionFilter[r]}
                                    onChange={() => toggleRegion(r)}
                                    style={{ accentColor: rColor, width: 14, height: 14, cursor: 'pointer' }} />
                                <span style={{ fontSize: 12, color: regionFilter[r] ? rColor : '#475569', fontWeight: 600 }}>
                                    {r}
                                </span>
                                <span style={{ fontSize: 10, color: '#334155', marginLeft: 'auto' }}>
                                    {allCctv.filter(c => c.region === r).length}대
                                </span>
                            </label>
                        );
                    })}
                </div>

                {/* 위성 레이어 (S-Loop OS vFinal) */}
                <div style={{
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    marginTop: 8, paddingTop: 10
                }}>
                    <div style={{
                        fontSize: 9, color: '#94a3b8', fontWeight: 700,
                        letterSpacing: '0.1em', marginBottom: 7
                    }}>
                        좌표 정밀도
                    </div>
                    <div
                        style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            padding: '7px 10px',
                            borderRadius: 7,
                            background: 'rgba(34,197,94,0.14)',
                            border: '1px solid rgba(34,197,94,0.34)',
                            color: '#86efac',
                            fontSize: 11,
                            fontWeight: 700,
                            marginBottom: 3,
                        }}
                    >
                        <span>정밀 좌표만 운영 노출</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{allCctv.length}</span>
                    </div>
                    <div style={{
                        fontSize: 9,
                        color: '#334155',
                        lineHeight: 1.5,
                        marginBottom: 7,
                    }}>
                        근사 좌표 {hiddenApproximateCount}대는 운영 뷰에서 완전히 숨겼습니다. 현재 화면에는 공식·검증 좌표만 노출됩니다.
                    </div>
                    <div style={{
                        fontSize: 9,
                        color: '#f59e0b',
                        lineHeight: 1.5,
                        marginBottom: 7,
                    }}>
                        해상/오차 의심 ITS {hiddenFlaggedCount}대는 원본 유지 상태로 화면에서만 숨깁니다.
                    </div>
                    <div style={{
                        fontSize: 9,
                        color: '#38bdf8',
                        lineHeight: 1.5,
                        marginBottom: 7,
                    }}>
                        행안부/기관 공식 좌표 우선 기준으로 근접 중복 {hiddenDuplicateCount}대도 함께 숨겼습니다.
                    </div>
                </div>

                <div style={{
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    marginTop: 8, paddingTop: 10
                }}>
                    <div style={{
                        fontSize: 9, color: '#38bdf8', fontWeight: 700,
                        letterSpacing: '0.1em', marginBottom: 7
                    }}>
                        실시간 도로 CCTV
                    </div>
                    <button
                        type="button"
                        onClick={() => onItsRoadOnlyChange(!itsRoadOnly)}
                        style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            padding: '7px 10px',
                            borderRadius: 7,
                            cursor: 'pointer',
                            background: itsRoadOnly ? 'rgba(56,189,248,0.14)' : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${itsRoadOnly ? 'rgba(56,189,248,0.4)' : 'rgba(255,255,255,0.06)'}`,
                            color: itsRoadOnly ? '#7dd3fc' : '#64748b',
                            fontSize: 11,
                            fontWeight: itsRoadOnly ? 700 : 500,
                            marginBottom: 3,
                            transition: 'all 0.15s',
                        }}
                    >
                        <span>ITS 국도/고속도로만 보기</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{liveTrafficCount}</span>
                    </button>
                    <div style={{
                        fontSize: 9,
                        color: '#334155',
                        lineHeight: 1.5,
                        marginBottom: 7,
                    }}>
                        기본값은 실시간 ITS만 노출합니다. 지도 전용 교통 좌표는 별도 토글로 분리합니다.
                    </div>
                    <button
                        type="button"
                        onClick={() => onShowMapOnlyTrafficChange(!showMapOnlyTraffic)}
                        style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            padding: '7px 10px',
                            borderRadius: 7,
                            cursor: 'pointer',
                            background: showMapOnlyTraffic ? 'rgba(148,163,184,0.12)' : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${showMapOnlyTraffic ? 'rgba(148,163,184,0.32)' : 'rgba(255,255,255,0.06)'}`,
                            color: showMapOnlyTraffic ? '#cbd5e1' : '#64748b',
                            fontSize: 11,
                            fontWeight: showMapOnlyTraffic ? 700 : 500,
                            marginBottom: 7,
                            transition: 'all 0.15s',
                        }}
                    >
                        <span>지도 전용 교통 포함</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{mapOnlyTrafficCount}</span>
                    </button>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 5,
                    }}>
                        {ROAD_PRESET_OPTIONS.map((preset) => {
                            const count = allCctv.filter((item) => matchesRoadPreset(item, preset.id) && hasLiveTrafficStream(item)).length;
                            const active = roadPreset === preset.id;
                            return (
                                <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => onRoadPresetChange(preset.id)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 6,
                                        padding: '6px 8px',
                                        borderRadius: 7,
                                        cursor: 'pointer',
                                        background: active ? 'rgba(14,165,233,0.16)' : 'rgba(255,255,255,0.02)',
                                        border: `1px solid ${active ? 'rgba(56,189,248,0.38)' : 'rgba(255,255,255,0.05)'}`,
                                        color: active ? '#7dd3fc' : '#64748b',
                                        fontSize: 10,
                                        fontWeight: active ? 700 : 500,
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    <span>{preset.label}</span>
                                    <span style={{ fontFamily: 'monospace', fontSize: 9 }}>{count}</span>
                                </button>
                            );
                        })}
                    </div>
                    {roadPreset !== 'all' && (
                        <div style={{
                            marginTop: 8,
                            padding: '8px 9px',
                            borderRadius: 8,
                            background: 'rgba(34,211,238,0.08)',
                            border: '1px solid rgba(34,211,238,0.18)',
                        }}>
                            <div style={{ fontSize: 10, color: '#67e8f9', fontWeight: 700, marginBottom: 6 }}>
                                도로축 추적 레이어
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, marginBottom: 6 }}>
                                {[
                                    { id: 'auto', label: '자동' },
                                    { id: 'forward', label: '상행/정방향' },
                                    { id: 'reverse', label: '하행/역방향' },
                                ].map((option) => (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => onRouteDirectionChange(option.id as RouteDirection)}
                                        style={{
                                            padding: '6px 6px',
                                            borderRadius: 6,
                                            cursor: 'pointer',
                                            background: routeDirection === option.id ? 'rgba(34,211,238,0.18)' : 'rgba(255,255,255,0.04)',
                                            border: `1px solid ${routeDirection === option.id ? 'rgba(34,211,238,0.32)' : 'rgba(255,255,255,0.08)'}`,
                                            color: routeDirection === option.id ? '#a5f3fc' : '#94a3b8',
                                            fontSize: 9,
                                            fontWeight: 700,
                                        }}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <span style={{ fontSize: 9, color: '#94a3b8' }}>출발지 키워드</span>
                                    <input
                                        type="text"
                                        value={routeStartQuery}
                                        onChange={(event) => onRouteStartQueryChange(event.target.value)}
                                        placeholder="예: 영종대교, 검단"
                                        style={{
                                            padding: '7px 8px',
                                            borderRadius: 6,
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            background: 'rgba(15,23,42,0.55)',
                                            color: '#e2e8f0',
                                            fontSize: 10,
                                        }}
                                    />
                                </label>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <span style={{ fontSize: 9, color: '#94a3b8' }}>도착지 키워드</span>
                                    <input
                                        type="text"
                                        value={routeDestinationQuery}
                                        onChange={(event) => onRouteDestinationQueryChange(event.target.value)}
                                        placeholder="예: 공항, 시천교"
                                        style={{
                                            padding: '7px 8px',
                                            borderRadius: 6,
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            background: 'rgba(15,23,42,0.55)',
                                            color: '#e2e8f0',
                                            fontSize: 10,
                                        }}
                                    />
                                </label>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, marginBottom: 6 }}>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <span style={{ fontSize: 9, color: '#94a3b8' }}>감시 시나리오 이름</span>
                                    <input
                                        type="text"
                                        value={routeScenarioName}
                                        onChange={(event) => onRouteScenarioNameChange(event.target.value)}
                                        placeholder="예: 영종대교 공항 진입 감시"
                                        style={{
                                            padding: '7px 8px',
                                            borderRadius: 6,
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            background: 'rgba(15,23,42,0.55)',
                                            color: '#e2e8f0',
                                            fontSize: 10,
                                        }}
                                    />
                                </label>
                                <button
                                    type="button"
                                    onClick={onSaveRouteScenario}
                                    disabled={!canSaveRouteScenario}
                                    style={{
                                        alignSelf: 'end',
                                        padding: '8px 10px',
                                        borderRadius: 6,
                                        cursor: canSaveRouteScenario ? 'pointer' : 'not-allowed',
                                        background: canSaveRouteScenario ? 'rgba(167,139,250,0.16)' : 'rgba(255,255,255,0.04)',
                                        border: `1px solid ${canSaveRouteScenario ? 'rgba(167,139,250,0.32)' : 'rgba(255,255,255,0.08)'}`,
                                        color: canSaveRouteScenario ? '#ddd6fe' : '#64748b',
                                        fontSize: 10,
                                        fontWeight: 700,
                                        minWidth: 72,
                                    }}
                                >
                                    저장
                                </button>
                            </div>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span style={{ fontSize: 9, color: '#94a3b8' }}>예상 속도</span>
                                <input
                                    type="range"
                                    min={20}
                                    max={120}
                                    step={10}
                                    value={routeSpeedKph}
                                    onChange={(event) => onRouteSpeedKphChange(Number(event.target.value))}
                                />
                                <span style={{ fontSize: 10, color: '#e2e8f0', fontFamily: 'monospace' }}>
                                    {routeSpeedKph} km/h
                                </span>
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, marginTop: 8 }}>
                                {[
                                    { id: 'focus', label: '집중군' },
                                    { id: 'bundle', label: '도로축' },
                                    { id: 'network', label: '전체ITS' },
                                ].map((option) => (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => onRouteScopeModeChange(option.id as RouteScopeMode)}
                                        style={{
                                            padding: '6px 6px',
                                            borderRadius: 6,
                                            cursor: 'pointer',
                                            background: routeScopeMode === option.id ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.04)',
                                            border: `1px solid ${routeScopeMode === option.id ? 'rgba(16,185,129,0.32)' : 'rgba(255,255,255,0.08)'}`,
                                            color: routeScopeMode === option.id ? '#bbf7d0' : '#94a3b8',
                                            fontSize: 9,
                                            fontWeight: 700,
                                        }}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b', marginTop: 6, lineHeight: 1.5 }}>
                                {routePlanSummary
                                    ? `${routePlanSummary.originLabel}${routePlanSummary.destinationLabel ? ` → ${routePlanSummary.destinationLabel}` : ''} · ${routePlanSummary.roadLabel} · ${routePlanSummary.directionLabel}(${routePlanSummary.directionSourceLabel}) · ${routePlanSummary.scopeLabel} · 식별 우선 ${routePlanSummary.highIdentificationCount}대 / 확인 우선 ${routePlanSummary.mediumIdentificationCount}대 / 즉시 ${routePlanSummary.immediateCount}대 / 단기 ${routePlanSummary.shortCount}대 / 중기 ${routePlanSummary.mediumCount}대 / 구간 ${routePlanSummary.segmentCount}대 / 전체 ${routePlanSummary.bundleCount}대`
                                    : '도로축 카메라를 하나 선택하면 추적 레이어가 지도 위에 추가됩니다.'}
                            </div>
                            <div style={{ fontSize: 9, color: '#c4b5fd', marginTop: 6, lineHeight: 1.5 }}>
                                포렌식은 현재 `노선 그룹 순차 분석`이 기본 경로입니다. 단일 CCTV 분석은 빠른 보조 확인용으로 둡니다.
                            </div>
                            {savedRouteScenarios.length > 0 && (
                                <div style={{
                                    marginTop: 8,
                                    paddingTop: 8,
                                    borderTop: '1px solid rgba(255,255,255,0.08)',
                                }}>
                                    <div style={{ fontSize: 9, color: '#c4b5fd', marginBottom: 5 }}>
                                        저장된 감시 시나리오
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                        {savedRouteScenarios.slice(0, 6).map((scenario) => (
                                            <div
                                                key={scenario.id}
                                                style={{
                                                    padding: '7px 8px',
                                                    borderRadius: 6,
                                                    background: 'rgba(167,139,250,0.08)',
                                                    border: '1px solid rgba(167,139,250,0.18)',
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 10, fontWeight: 700, color: '#e9d5ff' }}>
                                                            {scenario.name}
                                                        </div>
                                                        <div style={{ fontSize: 9, color: '#cbd5e1', marginTop: 2 }}>
                                                            {scenario.routeStartQuery || '출발지 미지정'}
                                                            {scenario.routeDestinationQuery ? ` → ${scenario.routeDestinationQuery}` : ''}
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => onLoadRouteScenario(scenario)}
                                                        style={{
                                                            padding: '5px 7px',
                                                            borderRadius: 5,
                                                            cursor: 'pointer',
                                                            background: 'rgba(56,189,248,0.14)',
                                                            border: '1px solid rgba(56,189,248,0.24)',
                                                            color: '#7dd3fc',
                                                            fontSize: 9,
                                                            fontWeight: 700,
                                                        }}
                                                    >
                                                        불러오기
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => onDeleteRouteScenario(scenario.id)}
                                                        style={{
                                                            padding: '5px 7px',
                                                            borderRadius: 5,
                                                            cursor: 'pointer',
                                                            background: 'rgba(239,68,68,0.12)',
                                                            border: '1px solid rgba(239,68,68,0.2)',
                                                            color: '#fca5a5',
                                                            fontSize: 9,
                                                            fontWeight: 700,
                                                        }}
                                                    >
                                                        삭제
                                                    </button>
                                                </div>
                                                <div style={{
                                                    display: 'flex',
                                                    flexWrap: 'wrap',
                                                    gap: 6,
                                                    marginTop: 4,
                                                    fontSize: 9,
                                                    color: '#ddd6fe',
                                                }}>
                                                    <span>{ROAD_PRESET_OPTIONS.find((preset) => preset.id === scenario.roadPreset)?.label ?? scenario.roadPreset}</span>
                                                    <span>{scenario.routeDirection === 'auto' ? '자동' : scenario.routeDirection === 'forward' ? '상행/정방향' : '하행/역방향'}</span>
                                                    <span>{scenario.routeScopeMode === 'focus' ? '집중군' : scenario.routeScopeMode === 'bundle' ? '도로축' : '전체ITS'}</span>
                                                    <span>{scenario.routeSpeedKph}km/h</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {!routePlanSummary && routeStartQuery && routeStartSuggestions.length > 0 && (
                                <div style={{ marginTop: 8 }}>
                                    <div style={{ fontSize: 9, color: '#38bdf8', marginBottom: 5 }}>
                                        출발지 키워드와 완전 일치하는 CCTV가 없어 같은 도로축 시작 후보를 제안합니다.
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                        {routeStartSuggestions.map((suggestion) => (
                                            <button
                                                key={suggestion.id}
                                                type="button"
                                                onClick={() => {
                                                    onRouteStartQueryChange(suggestion.name);
                                                    onRouteSuggestionPreviewClear?.();
                                                }}
                                                onMouseEnter={() => onRouteStartSuggestionPreview?.(suggestion.name)}
                                                onMouseLeave={() => onRouteSuggestionPreviewClear?.()}
                                                onFocus={() => onRouteStartSuggestionPreview?.(suggestion.name)}
                                                onBlur={() => onRouteSuggestionPreviewClear?.()}
                                                style={{
                                                    padding: '7px 8px',
                                                    borderRadius: 6,
                                                    cursor: 'pointer',
                                                    background: 'rgba(56,189,248,0.10)',
                                                    border: '1px solid rgba(56,189,248,0.22)',
                                                    color: '#bae6fd',
                                                    textAlign: 'left',
                                                }}
                                            >
                                                <div style={{ fontSize: 10, fontWeight: 700 }}>{suggestion.name}</div>
                                                <div style={{ fontSize: 9, color: '#cbd5e1', marginTop: 2 }}>
                                                    {suggestion.address}
                                                </div>
                                                {suggestion.matchReason && (
                                                    <div style={{ fontSize: 9, color: '#7dd3fc', marginTop: 3 }}>
                                                        {suggestion.matchReason}
                                                    </div>
                                                )}
                                                <div style={{
                                                    display: 'flex',
                                                    flexWrap: 'wrap',
                                                    gap: 6,
                                                    marginTop: 4,
                                                    fontSize: 9,
                                                    color: '#bae6fd',
                                                }}>
                                                    <span>{suggestion.region}</span>
                                                    {routeRoadLabel && <span>{routeRoadLabel}</span>}
                                                    {suggestion.distanceKm !== undefined && (
                                                        <span>현재 선택점 기준 {suggestion.distanceKm.toFixed(1)}km</span>
                                                    )}
                                                    {suggestion.previewSegmentCount !== undefined && (
                                                        <span>구간 {suggestion.previewSegmentCount}대</span>
                                                    )}
                                                    {suggestion.previewMaxEtaMinutes !== undefined && (
                                                        <span>최대 {suggestion.previewMaxEtaMinutes}분</span>
                                                    )}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {routePlanSummary && !routePlanSummary.startMatched && routePlanSummary.startQuery && routePlanSummary.startSuggestions.length > 0 && (
                                <div style={{ marginTop: 8 }}>
                                    <div style={{ fontSize: 9, color: '#38bdf8', marginBottom: 5 }}>
                                        출발지 키워드와 완전 일치하는 CCTV가 없어 같은 도로축 시작 후보를 제안합니다.
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                        {routePlanSummary.startSuggestions.map((suggestion) => (
                                            <button
                                                key={suggestion.id}
                                                type="button"
                                                onClick={() => onRouteStartQueryChange(suggestion.name)}
                                                style={{
                                                    padding: '7px 8px',
                                                    borderRadius: 6,
                                                    cursor: 'pointer',
                                                    background: 'rgba(56,189,248,0.10)',
                                                    border: '1px solid rgba(56,189,248,0.22)',
                                                    color: '#bae6fd',
                                                    textAlign: 'left',
                                                }}
                                            >
                                                <div style={{ fontSize: 10, fontWeight: 700 }}>{suggestion.name}</div>
                                                <div style={{ fontSize: 9, color: '#cbd5e1', marginTop: 2 }}>
                                                    {suggestion.address}
                                                </div>
                                                {suggestion.matchReason && (
                                                    <div style={{ fontSize: 9, color: '#7dd3fc', marginTop: 3 }}>
                                                        {suggestion.matchReason}
                                                    </div>
                                                )}
                                                <div style={{
                                                    display: 'flex',
                                                    flexWrap: 'wrap',
                                                    gap: 6,
                                                    marginTop: 4,
                                                    fontSize: 9,
                                                    color: '#bae6fd',
                                                }}>
                                                    <span>{suggestion.region}</span>
                                                    <span>{routePlanSummary.roadLabel}</span>
                                                    {suggestion.distanceKm !== undefined && (
                                                        <span>현재 선택점 기준 {suggestion.distanceKm.toFixed(1)}km</span>
                                                    )}
                                                    {suggestion.previewSegmentCount !== undefined && (
                                                        <span>구간 {suggestion.previewSegmentCount}대</span>
                                                    )}
                                                    {suggestion.previewMaxEtaMinutes !== undefined && (
                                                        <span>최대 {suggestion.previewMaxEtaMinutes}분</span>
                                                    )}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {routePlanSummary && !routePlanSummary.destinationMatched && routePlanSummary.destinationQuery && routePlanSummary.destinationSuggestions.length > 0 && (
                                <div style={{ marginTop: 8 }}>
                                    <div style={{ fontSize: 9, color: '#fbbf24', marginBottom: 5 }}>
                                        도착지 키워드와 완전 일치하는 CCTV가 없어 같은 도로축 후보를 제안합니다.
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                        {routePlanSummary.destinationSuggestions.map((suggestion) => (
                                            <button
                                                key={suggestion.id}
                                                type="button"
                                                onClick={() => {
                                                    onRouteDestinationQueryChange(suggestion.name);
                                                    onRouteSuggestionPreviewClear?.();
                                                }}
                                                onMouseEnter={() => onRouteDestinationSuggestionPreview?.(suggestion.name)}
                                                onMouseLeave={() => onRouteSuggestionPreviewClear?.()}
                                                onFocus={() => onRouteDestinationSuggestionPreview?.(suggestion.name)}
                                                onBlur={() => onRouteSuggestionPreviewClear?.()}
                                                style={{
                                                    padding: '7px 8px',
                                                    borderRadius: 6,
                                                    cursor: 'pointer',
                                                    background: 'rgba(251,191,36,0.10)',
                                                    border: '1px solid rgba(251,191,36,0.22)',
                                                    color: '#fde68a',
                                                    textAlign: 'left',
                                                }}
                                            >
                                                <div style={{ fontSize: 10, fontWeight: 700 }}>{suggestion.name}</div>
                                                <div style={{ fontSize: 9, color: '#cbd5e1', marginTop: 2 }}>
                                                    {suggestion.address}
                                                </div>
                                                {suggestion.matchReason && (
                                                    <div style={{ fontSize: 9, color: '#fcd34d', marginTop: 3 }}>
                                                        {suggestion.matchReason}
                                                    </div>
                                                )}
                                                <div style={{
                                                    display: 'flex',
                                                    flexWrap: 'wrap',
                                                    gap: 6,
                                                    marginTop: 4,
                                                    fontSize: 9,
                                                    color: '#fde68a',
                                                }}>
                                                    <span>{suggestion.region}</span>
                                                    <span>{routePlanSummary.roadLabel}</span>
                                                    {suggestion.routeDistanceKm !== undefined && (
                                                        <span>구간 {suggestion.routeDistanceKm.toFixed(1)}km</span>
                                                    )}
                                                    {suggestion.etaMinutes !== undefined && (
                                                        <span>ETA {suggestion.etaMinutes}분</span>
                                                    )}
                                                    {suggestion.timeWindowLabel && (
                                                        <span>{suggestion.timeWindowLabel}</span>
                                                    )}
                                                    {suggestion.previewSegmentCount !== undefined && (
                                                        <span>구간 {suggestion.previewSegmentCount}대</span>
                                                    )}
                                                    {suggestion.previewMaxEtaMinutes !== undefined && (
                                                        <span>최대 {suggestion.previewMaxEtaMinutes}분</span>
                                                    )}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div style={{
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    marginTop: 8, paddingTop: 10
                }}>
                    <div style={{
                        fontSize: 9, color: '#3b82f6', fontWeight: 700,
                        letterSpacing: '0.1em', marginBottom: 7, textTransform: 'uppercase'
                    }}>
                        🛰 Satellite Layers
                    </div>
                    {(['off', 'planet', 'sentinel'] as const)
                        .filter(m => availableSatelliteModes.includes(m))
                        .map(m => (
                            <button key={m} onClick={() => onSatelliteModeChange(m)}
                                style={{
                                    width: '100%', textAlign: 'left', padding: '6px 10px',
                                    borderRadius: 6, fontSize: 11, cursor: 'pointer',
                                    background: satelliteMode === m ? 'rgba(59,130,246,0.15)' : 'transparent',
                                    border: `1px solid ${satelliteMode === m ? 'rgba(59,130,246,0.4)' : 'transparent'}`,
                                    color: satelliteMode === m ? '#60a5fa' : '#475569',
                                    marginBottom: 3, fontWeight: satelliteMode === m ? 700 : 500,
                                    transition: 'all 0.1s'
                                }}>
                                {m === 'off' ? '비활성화' : m === 'planet' ? 'PLANET SKYSAT' : 'SENTINEL-2'}
                            </button>
                        ))}
                </div>
            </div>

            {/* 카메라 목록 */}
            <div style={{
                flex: 1, overflowY: 'auto', padding: '8px 10px',
                display: 'flex', flexDirection: 'column', gap: 6
            }}>
                <div style={{
                    fontSize: 9, color: '#334155', padding: '2px 4px',
                    marginBottom: 2
                }}>
                    {filteredList.length}대 표시
                </div>
                {filteredList.map(cam => {
                    const cfg = TYPE_CFG[cam.type];
                    const liveTrafficSource = isLiveTrafficSource(cam.source);
                    const localTrafficSource = isMapOnlyTrafficSource(cam.source);
                    return (
                        <div key={cam.id} onClick={() => { onSelect(cam); onFlyTo(cam); }}
                            style={{
                                padding: '9px 11px', borderRadius: 8, cursor: 'pointer',
                                background: 'rgba(255,255,255,0.025)',
                                border: '1px solid rgba(255,255,255,0.06)',
                                transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => {
                                (e.currentTarget as HTMLDivElement).style.background = `${cfg.color}12`;
                                (e.currentTarget as HTMLDivElement).style.borderColor = `${cfg.color}40`;
                            }}
                            onMouseLeave={e => {
                                (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.025)';
                                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.06)';
                            }}
                        >
                            <div style={{
                                display: 'flex', justifyContent: 'space-between',
                                alignItems: 'center', marginBottom: 4
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                                    <span style={{
                                        fontSize: 9, fontFamily: 'monospace',
                                        color: '#334155', background: 'rgba(255,255,255,0.04)',
                                        padding: '1px 5px', borderRadius: 3
                                    }}>
                                        {cam.id}
                                    </span>
                                    {liveTrafficSource && (
                                        <span style={{
                                            fontSize: 8,
                                            fontWeight: 800,
                                            color: '#7dd3fc',
                                            background: 'rgba(56,189,248,0.12)',
                                            border: '1px solid rgba(56,189,248,0.26)',
                                            padding: '1px 5px',
                                            borderRadius: 999,
                                            letterSpacing: '0.08em',
                                            flexShrink: 0,
                                        }}>
                                            ITS LIVE
                                        </span>
                                    )}
                                    {localTrafficSource && (
                                        <span style={{
                                            fontSize: 8,
                                            fontWeight: 800,
                                            color: '#94a3b8',
                                            background: 'rgba(148,163,184,0.10)',
                                            border: '1px solid rgba(148,163,184,0.2)',
                                            padding: '1px 5px',
                                            borderRadius: 999,
                                            letterSpacing: '0.08em',
                                            flexShrink: 0,
                                        }}>
                                            지도 전용
                                        </span>
                                    )}
                                </div>
                                <span style={{
                                    fontSize: 9, fontWeight: 700,
                                    color: cam.status === '정상' ? '#22c55e' : cam.status === '점검중' ? '#f59e0b' : '#ef4444',
                                }}>
                                    {cam.status === '정상' ? '●' : cam.status === '점검중' ? '◐' : '✕'} {cam.status}
                                </span>
                            </div>
                            <div style={{
                                fontSize: 11, fontWeight: 600, color: '#e2e8f0',
                                marginBottom: 3, lineHeight: 1.3
                            }}>
                                {cfg.icon} {cam.name}
                            </div>
                            <div style={{ fontSize: 9, color: '#475569' }}>
                                {liveTrafficSource
                                    ? `${cam.district} · 실시간 도로`
                                    : localTrafficSource
                                        ? `${cam.district} · 좌표 전용`
                                        : cam.district}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
