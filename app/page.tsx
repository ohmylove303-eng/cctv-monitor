'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import StatusBar from '@/components/StatusBar';
import SidePanel from '@/components/SidePanel';
import CctvMap, { CctvMapHandle } from '@/components/CctvMap';
import EventPanel from '@/components/EventPanel';
import CameraDetail from '@/components/CameraDetail';
import ForensicModal from '@/components/ForensicModal';

import {
    CctvItem,
    ForensicStatusResponse,
    ForensicTrackingResult,
    LayerVisibility,
    RegionFilter,
    RoadPreset,
    RouteDirection,
    RouteScopeMode,
} from '@/types/cctv';
import { SatelliteMode } from '@/components/SatelliteControlPanel';
import SatelliteControlPanel from '@/components/SatelliteControlPanel';
import { matchesRoadPreset } from '@/lib/road-presets';
import { buildForensicTrackScope, getForensicStatus } from '@/lib/forensic';
import { hasLiveTrafficStream, isMapOnlyTrafficCamera } from '@/lib/traffic-sources';
import { hasVerifiedCoordinate } from '@/lib/coordinate-quality';
import { dedupeOperationalDisplayCctv } from '@/lib/display-cctv';
import { buildForensicRouteContext, buildRouteMonitoringPlan, buildRouteQuerySuggestions, buildRouteScopedTrackScope } from '@/lib/route-monitoring';

type SavedRouteScenario = {
    id: string;
    name: string;
    selectedCctvId: string | null;
    roadPreset: RoadPreset;
    routeDirection: RouteDirection;
    routeSpeedKph: number;
    routeScopeMode: RouteScopeMode;
    routeStartQuery: string;
    routeDestinationQuery: string;
    createdAt: string;
    updatedAt: string;
};

type LiveTrafficRecommendation = {
    id: string;
    name: string;
    region: CctvItem['region'];
    address: string;
    source?: string;
    distanceKm: number;
};

const ROUTE_SCENARIO_STORAGE_KEY = 'cctv-monitor.route-scenarios.v1';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

    return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

function getRouteDirectionLabel(direction: RouteDirection) {
    switch (direction) {
        case 'forward':
            return '상행/정방향';
        case 'reverse':
            return '하행/역방향';
        default:
            return '자동';
    }
}

function getRouteDirectionSourceLabel(source: 'manual' | 'token_hint' | 'density' | 'destination') {
    switch (source) {
        case 'manual':
            return '수동';
        case 'destination':
            return '도착지';
        case 'token_hint':
            return '이름/주소';
        default:
            return '축 밀도';
    }
}

function getRouteScopeLabel(scopeMode: RouteScopeMode) {
    switch (scopeMode) {
        case 'focus':
            return '집중군 우선';
        case 'bundle':
            return '도로축 전체';
        default:
            return '전체 ITS';
    }
}

function summarizeRouteSuggestionPreview<T extends { id: string }>(
    suggestions: T[],
    buildPreview: (suggestion: T) => ReturnType<typeof buildRouteMonitoringPlan>,
) {
    return suggestions.map((suggestion) => {
        const previewPlan = buildPreview(suggestion);
        const previewMaxEtaMinutes = previewPlan && previewPlan.candidates.length > 0
            ? Math.max(...previewPlan.candidates.map((candidate) => candidate.etaMinutes))
            : undefined;

        return {
            ...suggestion,
            previewSegmentCount: previewPlan?.segmentCount,
            previewMaxEtaMinutes,
        };
    });
}

export default function DashboardPage() {
    const mapRef = useRef<CctvMapHandle>(null);
    const routeScenarioHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ─── 데이터 상태 (빈 배열로 시작, API에서 전적으로 구성) ──────────────────────────────────
    const [allCctv, setAllCctv] = useState<CctvItem[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [dataError, setDataError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [showForensic, setShowForensic] = useState(false);
    const [trackingOverlay, setTrackingOverlay] = useState<ForensicTrackingResult | null>(null);
    const [forensicStatus, setForensicStatus] = useState({
        enabled: false,
        provider: 'missing' as 'configured' | 'fallback' | 'missing',
        mode: null as string | null,
        ocr: null as ForensicStatusResponse['ocr'] | null,
        message: 'ITS 차량 분석 서버 상태 확인 전',
    });

    // ─── 필터 상태 ──────────────────────────────────────────────────────────
    const [visible, setVisible] = useState<LayerVisibility>({ crime: true, fire: true, traffic: true });
    const [regionFilter, setRegionFilter] = useState<RegionFilter>({ '김포': true, '인천': true, '서울': true });
    const [itsRoadOnly, setItsRoadOnly] = useState(false);
    const [roadPreset, setRoadPreset] = useState<RoadPreset>('all');
    const [routeDirection, setRouteDirection] = useState<RouteDirection>('auto');
    const [routeSpeedKph, setRouteSpeedKph] = useState(60);
    const [routeScopeMode, setRouteScopeMode] = useState<RouteScopeMode>('focus');
    const [routeStartQuery, setRouteStartQuery] = useState('');
    const [routeDestinationQuery, setRouteDestinationQuery] = useState('');
    const [routePreviewPlan, setRoutePreviewPlan] = useState<ReturnType<typeof buildRouteMonitoringPlan> | null>(null);
    const [routeScenarioName, setRouteScenarioName] = useState('');
    const [savedRouteScenarios, setSavedRouteScenarios] = useState<SavedRouteScenario[]>([]);
    const [showMapOnlyTraffic, setShowMapOnlyTraffic] = useState(false);

    // ─── 위성 옵션 (S-Loop OS vFinal) ──────────────────────────────────────────
    const [satelliteMode, setSatelliteMode] = useState<SatelliteMode>('sentinel');
    const [availableSatelliteModes, setAvailableSatelliteModes] = useState<SatelliteMode[]>(['off', 'sentinel']);
    const [satelliteOpacity, setSatelliteOpacity] = useState(60);
    const [sentinelDate, setSentinelDate] = useState(new Date().toISOString().split('T')[0]);
    const [satLastUpdated, setSatLastUpdated] = useState<string | null>(null);
    const [isSatLoading, setIsSatLoading] = useState(false);
    const [satError, setSatError] = useState<string | null>(null);

    // ─── 실시간 데이터 로드 (단일 canonical API 경로) ──────────────────────────
    useEffect(() => {
        const controller = new AbortController();

        async function syncRealData() {
            setIsLoadingData(true);
            setDataError(null);

            try {
                const res = await fetch('/api/cctv', {
                    cache: 'no-store',
                    signal: controller.signal,
                });
                const payload = await res.json();

                if (!res.ok) {
                    throw new Error(
                        typeof payload?.error === 'string' ? payload.error : '실시간 CCTV 데이터 동기화에 실패했습니다.'
                    );
                }

                if (!Array.isArray(payload)) {
                    throw new Error('실시간 CCTV 응답 형식이 올바르지 않습니다.');
                }

                if (!controller.signal.aborted) {
                    setAllCctv(payload);
                }
            } catch (err) {
                if (controller.signal.aborted) return;
                console.error('[ITS Sync] Failed critical load:', err);
                setAllCctv([]);
                setDataError(err instanceof Error ? err.message : '실시간 CCTV 데이터를 불러오지 못했습니다.');
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoadingData(false);
                }
            }
        }
        syncRealData();

        return () => controller.abort();
    }, []);

    useEffect(() => {
        let mounted = true;

        getForensicStatus()
            .then((status) => {
                if (!mounted) return;
                setForensicStatus({
                    enabled: status.enabled,
                    provider: status.provider,
                    mode: status.mode ?? null,
                    ocr: status.ocr ?? null,
                    message: status.message,
                });
            })
            .catch((error) => {
                if (!mounted) return;
                setForensicStatus({
                    enabled: false,
                    provider: 'missing',
                    mode: null,
                    ocr: null,
                    message: error instanceof Error
                        ? error.message
                        : 'ITS 차량 분석 서버 상태를 확인할 수 없습니다.',
                });
            });

        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(ROUTE_SCENARIO_STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return;
            const normalized = parsed.filter((item): item is SavedRouteScenario => {
                return typeof item?.id === 'string'
                    && typeof item?.name === 'string'
                    && typeof item?.roadPreset === 'string'
                    && typeof item?.routeDirection === 'string'
                    && typeof item?.routeSpeedKph === 'number'
                    && typeof item?.routeScopeMode === 'string'
                    && typeof item?.routeStartQuery === 'string'
                    && typeof item?.routeDestinationQuery === 'string';
            });
            setSavedRouteScenarios(
                normalized.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
            );
        } catch {
            // Ignore broken local scenario storage and continue with empty list.
        }
    }, []);

    useEffect(() => {
        try {
            window.localStorage.setItem(ROUTE_SCENARIO_STORAGE_KEY, JSON.stringify(savedRouteScenarios));
        } catch {
            // Ignore quota/storage issues; scenarios remain in memory for the session.
        }
    }, [savedRouteScenarios]);

    useEffect(() => {
        return () => {
            if (routeScenarioHighlightTimerRef.current) {
                clearTimeout(routeScenarioHighlightTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (satelliteMode === 'off') {
            setSatError(null);
        }
    }, [satelliteMode]);

    useEffect(() => {
        const controller = new AbortController();

        async function loadSatelliteProviders() {
            try {
                const res = await fetch('/api/satellite/providers', {
                    cache: 'no-store',
                    signal: controller.signal,
                });
                const payload = await res.json() as Partial<Record<SatelliteMode, boolean>>;

                if (!res.ok) return;

                const nextModes = (['off', 'sentinel', 'planet'] as const)
                    .filter(mode => payload[mode]);

                if (!controller.signal.aborted && nextModes.length > 0) {
                    setAvailableSatelliteModes(nextModes);
                }
            } catch {
                // Keep the default provider list when the capability probe fails.
            }
        }

        loadSatelliteProviders();
        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (!availableSatelliteModes.includes(satelliteMode)) {
            setSatelliteMode(availableSatelliteModes.includes('sentinel') ? 'sentinel' : 'off');
        }
    }, [availableSatelliteModes, satelliteMode]);

    const operationalCctv = useMemo(
        () => allCctv.filter(hasVerifiedCoordinate),
        [allCctv]
    );

    const hiddenApproximateCount = allCctv.length - operationalCctv.length;
    const {
        items: displayCctv,
        hiddenFlaggedCount,
        hiddenDuplicateCount,
    } = useMemo(
        () => dedupeOperationalDisplayCctv(operationalCctv),
        [operationalCctv]
    );

    const selectedCctv = useMemo(() =>
        displayCctv.find(c => c.id === selectedId) || null
        , [displayCctv, selectedId]);

    const recommendedLiveTraffic = useMemo<LiveTrafficRecommendation[]>(() => {
        if (!selectedCctv || !isMapOnlyTrafficCamera(selectedCctv)) {
            return [];
        }

        return displayCctv
            .filter(candidate => candidate.id !== selectedCctv.id && hasLiveTrafficStream(candidate))
            .map(candidate => ({
                id: candidate.id,
                name: candidate.name,
                region: candidate.region,
                address: candidate.address,
                source: candidate.source,
                distanceKm: haversineKm(selectedCctv.lat, selectedCctv.lng, candidate.lat, candidate.lng),
            }))
            .sort((left, right) => left.distanceKm - right.distanceKm)
            .slice(0, 3);
    }, [displayCctv, selectedCctv]);

    const routeMonitoringPlan = useMemo(() => {
        return buildRouteMonitoringPlan(selectedCctv, displayCctv, roadPreset, {
            direction: routeDirection,
            speedKph: routeSpeedKph,
            startQuery: routeStartQuery,
            destinationQuery: routeDestinationQuery,
        });
    }, [displayCctv, roadPreset, routeDestinationQuery, routeDirection, routeSpeedKph, routeStartQuery, selectedCctv]);

    const routeStartSuggestions = useMemo(() => {
        if (routeMonitoringPlan || roadPreset === 'all' || !routeStartQuery.trim()) {
            return [];
        }

        const referenceItem = selectedCctv && selectedCctv.type === 'traffic' && hasLiveTrafficStream(selectedCctv)
            ? selectedCctv
            : null;

        return buildRouteQuerySuggestions(displayCctv, roadPreset, routeStartQuery, {
            excludeId: referenceItem?.id,
            referenceItem,
        });
    }, [displayCctv, roadPreset, routeMonitoringPlan, routeStartQuery, selectedCctv]);

    const routeStartSuggestionSummaries = useMemo(() => {
        return summarizeRouteSuggestionPreview(routeStartSuggestions, (suggestion) =>
            buildRouteMonitoringPlan(selectedCctv, displayCctv, roadPreset, {
                direction: routeDirection,
                speedKph: routeSpeedKph,
                startQuery: suggestion.name,
                destinationQuery: routeDestinationQuery,
            })
        );
    }, [displayCctv, roadPreset, routeDestinationQuery, routeDirection, routeSpeedKph, routeStartSuggestions, selectedCctv]);

    const routeDestinationSuggestionSummaries = useMemo(() => {
        const suggestions = routeMonitoringPlan?.destinationSuggestions ?? [];
        return summarizeRouteSuggestionPreview(suggestions, (suggestion) =>
            buildRouteMonitoringPlan(selectedCctv, displayCctv, roadPreset, {
                direction: routeDirection,
                speedKph: routeSpeedKph,
                startQuery: routeStartQuery,
                destinationQuery: suggestion.name,
            })
        );
    }, [displayCctv, roadPreset, routeDirection, routeMonitoringPlan, routeSpeedKph, routeStartQuery, selectedCctv]);

    const prioritizedTrackScope = useMemo(() => {
        const baseScope = buildForensicTrackScope(displayCctv);

        return routeMonitoringPlan
            ? buildRouteScopedTrackScope(baseScope, routeMonitoringPlan, routeScopeMode)
            : baseScope;
    }, [displayCctv, routeMonitoringPlan, routeScopeMode]);

    const forensicRouteContext = useMemo(
        () => routeMonitoringPlan ? buildForensicRouteContext(routeMonitoringPlan, routeScopeMode) : null,
        [routeMonitoringPlan, routeScopeMode]
    );

    const visibleMapItems = useMemo(() =>
        displayCctv.filter(c => {
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
        })
        , [displayCctv, itsRoadOnly, regionFilter, roadPreset, showMapOnlyTraffic, visible]);

    const roadOverlayItems = useMemo(() =>
        displayCctv.filter((item) =>
            item.type === 'traffic'
            && visible.traffic
            && regionFilter[item.region]
            && hasLiveTrafficStream(item)
        )
        , [displayCctv, regionFilter, visible.traffic]);

    useEffect(() => {
        if ((roadPreset === 'all' && !itsRoadOnly) || visibleMapItems.length === 0) {
            return;
        }

        const segmentItems = routeMonitoringPlan
            ? visibleMapItems.filter((item) => routeMonitoringPlan.prioritizedIds.includes(item.id))
            : [];

        mapRef.current?.fitToItems(segmentItems.length >= 2 ? segmentItems : visibleMapItems);
    }, [itsRoadOnly, roadPreset, routeMonitoringPlan, visibleMapItems]);

    const handleItsRoadOnlyChange = (next: boolean) => {
        setItsRoadOnly(next);
        if (next) {
            setRoadPreset('all');
        }
    };

    const handleRoadPresetChange = (next: RoadPreset) => {
        setRoadPreset((current) => (current === next ? 'all' : next));
        if (next !== 'all') {
            setItsRoadOnly(false);
        }
        setRoutePreviewPlan(null);
    };

    const clearRoutePreview = () => {
        setRoutePreviewPlan(null);
    };

    useEffect(() => {
        if (roadPreset === 'all') {
            setRouteScenarioName('');
            return;
        }

        const defaultName = routeMonitoringPlan
            ? `${routeMonitoringPlan.roadLabel} · ${routeMonitoringPlan.originLabel}${routeMonitoringPlan.destinationLabel ? ` → ${routeMonitoringPlan.destinationLabel}` : ''}`
            : routeStartQuery.trim()
                ? `${roadPreset} · ${routeStartQuery.trim()}${routeDestinationQuery.trim() ? ` → ${routeDestinationQuery.trim()}` : ''}`
                : '';

        setRouteScenarioName((current) => current.trim() ? current : defaultName);
    }, [roadPreset, routeDestinationQuery, routeMonitoringPlan, routeStartQuery]);

    const previewRouteStartSuggestion = (name: string) => {
        setRoutePreviewPlan(
            buildRouteMonitoringPlan(selectedCctv, displayCctv, roadPreset, {
                direction: routeDirection,
                speedKph: routeSpeedKph,
                startQuery: name,
                destinationQuery: routeDestinationQuery,
            })
        );
    };

    const saveRouteScenario = () => {
        if (!routeMonitoringPlan || roadPreset === 'all') {
            return;
        }

        const now = new Date().toISOString();
        const normalizedName = routeScenarioName.trim() || `${routeMonitoringPlan.roadLabel} · ${routeMonitoringPlan.originLabel}`;
        const existing = savedRouteScenarios.find((scenario) => scenario.name === normalizedName);

        const nextScenario: SavedRouteScenario = {
            id: existing?.id ?? `route-scenario-${Date.now()}`,
            name: normalizedName,
            selectedCctvId: selectedCctv?.id ?? null,
            roadPreset,
            routeDirection,
            routeSpeedKph,
            routeScopeMode,
            routeStartQuery,
            routeDestinationQuery,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };

        setSavedRouteScenarios((current) =>
            [nextScenario, ...current.filter((scenario) => scenario.id !== nextScenario.id)]
                .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
                .slice(0, 12)
        );
    };

    const loadRouteScenario = (scenario: {
        id: string;
        name: string;
        selectedCctvId?: string | null;
        roadPreset: RoadPreset;
        routeDirection: RouteDirection;
        routeSpeedKph: number;
        routeScopeMode: RouteScopeMode;
        routeStartQuery: string;
        routeDestinationQuery: string;
        updatedAt: string;
    }) => {
        setRoadPreset(scenario.roadPreset);
        setItsRoadOnly(false);
        setRouteDirection(scenario.routeDirection);
        setRouteSpeedKph(scenario.routeSpeedKph);
        setRouteScopeMode(scenario.routeScopeMode);
        setRouteStartQuery(scenario.routeStartQuery);
        setRouteDestinationQuery(scenario.routeDestinationQuery);
        setRouteScenarioName(scenario.name);
        setRoutePreviewPlan(null);
        if (scenario.selectedCctvId && displayCctv.some((item) => item.id === scenario.selectedCctvId)) {
            setSelectedId(scenario.selectedCctvId);
        }

        const scenarioOrigin = scenario.selectedCctvId
            ? displayCctv.find((item) => item.id === scenario.selectedCctvId) ?? selectedCctv
            : selectedCctv;
        const previewPlan = buildRouteMonitoringPlan(scenarioOrigin, displayCctv, scenario.roadPreset, {
            direction: scenario.routeDirection,
            speedKph: scenario.routeSpeedKph,
            startQuery: scenario.routeStartQuery,
            destinationQuery: scenario.routeDestinationQuery,
        });
        setRoutePreviewPlan(previewPlan);

        if (previewPlan) {
            const segmentItems = displayCctv.filter((item) => previewPlan.prioritizedIds.includes(item.id));
            mapRef.current?.fitToItems(segmentItems.length >= 2 ? segmentItems : displayCctv.filter((item) => matchesRoadPreset(item, scenario.roadPreset) && hasLiveTrafficStream(item)));
        }

        if (routeScenarioHighlightTimerRef.current) {
            clearTimeout(routeScenarioHighlightTimerRef.current);
        }
        routeScenarioHighlightTimerRef.current = setTimeout(() => {
            setRoutePreviewPlan(null);
            routeScenarioHighlightTimerRef.current = null;
        }, 4500);
    };

    const deleteRouteScenario = (scenarioId: string) => {
        setSavedRouteScenarios((current) => current.filter((scenario) => scenario.id !== scenarioId));
    };

    const previewRouteDestinationSuggestion = (name: string) => {
        setRoutePreviewPlan(
            buildRouteMonitoringPlan(selectedCctv, displayCctv, roadPreset, {
                direction: routeDirection,
                speedKph: routeSpeedKph,
                startQuery: routeStartQuery,
                destinationQuery: name,
            })
        );
    };

    // ─── 핸들러 ───────────────────────────────────────────────────────────
    const handleLocate = (id: string) => {
        const item = displayCctv.find(c => c.id === id);
        if (item) {
            setSelectedId(item.id);
            mapRef.current?.flyTo(item.lat, item.lng, 15);
        }
    };

    useEffect(() => {
        if (selectedId && !selectedCctv) {
            setSelectedId(null);
        }
    }, [selectedCctv, selectedId]);

    return (
        <main className="app-container">
            {/* 상단 통합 상황 바 */}
            <StatusBar allItems={displayCctv} />

            <div className="main-content">
                {/* 좌측 패널 (CCTV 레이어 + 지역 필터 + 위성 레이어 제어) */}
                <div className="left-panel">
                    <SidePanel
                        allCctv={displayCctv}
                        hiddenApproximateCount={hiddenApproximateCount}
                        hiddenFlaggedCount={hiddenFlaggedCount}
                        hiddenDuplicateCount={hiddenDuplicateCount}
                        visible={visible}
                        regionFilter={regionFilter}
                        onVisibleChange={setVisible}
                        onRegionChange={setRegionFilter}
                        onSelect={(c) => setSelectedId(c.id)}
                        onFlyTo={(c) => mapRef.current?.flyTo(c.lat, c.lng, 15)}
                        itsRoadOnly={itsRoadOnly}
                        onItsRoadOnlyChange={handleItsRoadOnlyChange}
                        roadPreset={roadPreset}
                        onRoadPresetChange={handleRoadPresetChange}
                        routeDirection={routeDirection}
                        onRouteDirectionChange={setRouteDirection}
                        routeSpeedKph={routeSpeedKph}
                        onRouteSpeedKphChange={setRouteSpeedKph}
                        routeScopeMode={routeScopeMode}
                        onRouteScopeModeChange={setRouteScopeMode}
                        routeStartQuery={routeStartQuery}
                        onRouteStartQueryChange={(value) => {
                            setRouteStartQuery(value);
                            setRoutePreviewPlan(null);
                        }}
                        routeDestinationQuery={routeDestinationQuery}
                        onRouteDestinationQueryChange={(value) => {
                            setRouteDestinationQuery(value);
                            setRoutePreviewPlan(null);
                        }}
                        routeScenarioName={routeScenarioName}
                        onRouteScenarioNameChange={setRouteScenarioName}
                        canSaveRouteScenario={Boolean(routeMonitoringPlan && roadPreset !== 'all')}
                        onSaveRouteScenario={saveRouteScenario}
                        savedRouteScenarios={savedRouteScenarios}
                        onLoadRouteScenario={loadRouteScenario}
                        onDeleteRouteScenario={deleteRouteScenario}
                        onRouteStartSuggestionPreview={previewRouteStartSuggestion}
                        onRouteDestinationSuggestionPreview={previewRouteDestinationSuggestion}
                        onRouteSuggestionPreviewClear={clearRoutePreview}
                        routeRoadLabel={roadPreset !== 'all' ? routeMonitoringPlan?.roadLabel ?? undefined : undefined}
                        routeStartSuggestions={routeStartSuggestionSummaries}
                    routePlanSummary={routeMonitoringPlan ? {
                        roadLabel: routeMonitoringPlan.roadLabel,
                        originLabel: routeMonitoringPlan.originLabel,
                        startQuery: routeMonitoringPlan.startQuery,
                        startMatched: routeMonitoringPlan.startMatched,
                        startSuggestions: summarizeRouteSuggestionPreview(routeMonitoringPlan.startSuggestions, (suggestion) =>
                            buildRouteMonitoringPlan(selectedCctv, displayCctv, roadPreset, {
                                direction: routeDirection,
                                speedKph: routeSpeedKph,
                                startQuery: suggestion.name,
                                destinationQuery: routeDestinationQuery,
                            })
                        ),
                        destinationLabel: routeMonitoringPlan.destinationLabel,
                        destinationQuery: routeMonitoringPlan.destinationQuery,
                        destinationMatched: routeMonitoringPlan.destinationMatched,
                        destinationSuggestions: routeDestinationSuggestionSummaries,
                        focusCount: routeMonitoringPlan.focusCount,
                        highIdentificationCount: routeMonitoringPlan.highIdentificationCount,
                        mediumIdentificationCount: routeMonitoringPlan.mediumIdentificationCount,
                        bundleCount: routeMonitoringPlan.bundleCount,
                        segmentCount: routeMonitoringPlan.segmentCount,
                        directionLabel: getRouteDirectionLabel(routeMonitoringPlan.resolvedDirection),
                        directionSourceLabel: getRouteDirectionSourceLabel(routeMonitoringPlan.directionSource),
                        immediateCount: routeMonitoringPlan.candidates.filter((candidate) => candidate.timeWindowLabel === '즉시').length,
                        shortCount: routeMonitoringPlan.candidates.filter((candidate) => candidate.timeWindowLabel === '단기').length,
                        mediumCount: routeMonitoringPlan.candidates.filter((candidate) => candidate.timeWindowLabel === '중기').length,
                        scopeLabel: getRouteScopeLabel(routeScopeMode),
                    } : null}
                    showMapOnlyTraffic={showMapOnlyTraffic}
                    onShowMapOnlyTrafficChange={setShowMapOnlyTraffic}
                        satelliteMode={satelliteMode}
                        onSatelliteModeChange={setSatelliteMode}
                        availableSatelliteModes={availableSatelliteModes}
                    />
                </div>

                {/* 중앙 지도 (Deck.gl + MapLibre Fusion) */}
                <div className="center-map">
                    <CctvMap
                        ref={mapRef}
                        items={visibleMapItems}
                        roadOverlayItems={roadOverlayItems}
                        roadPreset={roadPreset}
                        trackingOverlay={trackingOverlay}
                        trackingLookupItems={displayCctv}
                        onRoadPresetSelect={handleRoadPresetChange}
                        routeMonitoringPlan={routeMonitoringPlan}
                        routePreviewPlan={routePreviewPlan}
                        onSelect={(c) => setSelectedId(c.id)}
                        satelliteMode={satelliteMode}
                        satelliteOpacity={satelliteOpacity}
                        sentinelDate={sentinelDate}
                        onLastUpdated={setSatLastUpdated}
                        onLoadingChange={setIsSatLoading}
                        onErrorChange={setSatError}
                    />

                    {/* 플로팅 위성 제어 패널 */}
                    <SatelliteControlPanel
                        mode={satelliteMode}
                        onModeChange={setSatelliteMode}
                        availableModes={availableSatelliteModes}
                        opacity={satelliteOpacity}
                        onOpacityChange={setSatelliteOpacity}
                        sentinelDate={sentinelDate}
                        onSentinelDateChange={setSentinelDate}
                        lastUpdated={satLastUpdated}
                        isLoading={isSatLoading}
                        errorMessage={satError}
                    />
                </div>

                {/* 우측 패널 (LIVE EVENTS + 분석 패널) */}
                <div className="right-panel">
                    {isLoadingData && (
                        <div
                            className="glass-panel"
                            style={{
                                borderRadius: 12,
                                padding: '12px 14px',
                                marginBottom: 10,
                                color: '#94a3b8',
                                fontSize: 11,
                            }}
                        >
                            실시간 CCTV 데이터를 동기화하는 중입니다.
                        </div>
                    )}

                    {dataError && (
                        <div
                            className="glass-panel"
                            style={{
                                borderRadius: 12,
                                padding: '12px 14px',
                                marginBottom: 10,
                                border: '1px solid rgba(239,68,68,0.24)',
                                background: 'rgba(127, 29, 29, 0.16)',
                                color: '#fca5a5',
                                fontSize: 11,
                                lineHeight: 1.5,
                            }}
                        >
                            실시간 CCTV 데이터 동기화 실패
                            <div style={{ color: '#fecaca', marginTop: 4 }}>{dataError}</div>
                        </div>
                    )}

                    <EventPanel
                        items={displayCctv}
                        onLocate={handleLocate}
                    />

                    {/* [UNITY FIX] 선택 시 하단 상세 패널 (CameraDetail로 일원화) */}
                    {selectedCctv && (
                        <CameraDetail
                            camera={{
                                id: selectedCctv.id,
                                name: selectedCctv.name,
                                region: selectedCctv.region,
                                location: selectedCctv.address,
                                position: { lat: selectedCctv.lat, lng: selectedCctv.lng },
                                cameraType: selectedCctv.type,
                                status:
                                    selectedCctv.status === '고장'
                                        ? 'offline'
                                        : selectedCctv.status === '점검중'
                                            ? 'alert'
                                            : 'normal',
                                resolution: '4K UHD',
                                fps: 30,
                                installedAt: '2023-01-01',
                                lastMaintenance: '2024-03-01',
                                source: selectedCctv.source,
                                operator: selectedCctv.operator,
                                coordinateSource: selectedCctv.coordinateSource,
                                coordinateVerified: selectedCctv.coordinateVerified,
                                coordinateNote: selectedCctv.coordinateNote,
                                // [CRITICAL] hlsUrl이 있는 경우 최우선적으로 streamUrl로 할당
                                streamUrl: selectedCctv.hlsUrl || selectedCctv.streamUrl || ''
                            }}
                            recommendedLiveCameras={recommendedLiveTraffic}
                            routeMonitoring={routeMonitoringPlan ? {
                                roadLabel: routeMonitoringPlan.roadLabel,
                                originLabel: routeMonitoringPlan.originLabel,
                                destinationLabel: routeMonitoringPlan.destinationLabel,
                                bundleCount: routeMonitoringPlan.bundleCount,
                                segmentCount: routeMonitoringPlan.segmentCount,
                                focusCount: routeMonitoringPlan.focusCount,
                                highIdentificationCount: routeMonitoringPlan.highIdentificationCount,
                                mediumIdentificationCount: routeMonitoringPlan.mediumIdentificationCount,
                                directionLabel: getRouteDirectionLabel(routeMonitoringPlan.resolvedDirection),
                                directionSourceLabel: getRouteDirectionSourceLabel(routeMonitoringPlan.directionSource),
                                scopeLabel: getRouteScopeLabel(routeScopeMode),
                                immediateCount: routeMonitoringPlan.immediateIds.length,
                                shortCount: routeMonitoringPlan.shortIds.length,
                                mediumCount: routeMonitoringPlan.mediumIds.length,
                                candidates: routeMonitoringPlan.candidates,
                            } : null}
                            onSelectRecommended={handleLocate}
                            onClose={() => setSelectedId(null)}
                            onAnalysis={hasLiveTrafficStream(selectedCctv) ? () => {
                                console.log('[UI] Triggering forensic for:', selectedCctv.id, 'Stream:', selectedCctv.hlsUrl || selectedCctv.streamUrl);
                                setShowForensic(true);
                            } : undefined}
                        />
                    )}
                </div>
            </div>

            {/* 디자인 일관성을 위한 전역 CSS 보강 */}
            <style jsx global>{`
                :root {
                    --neon-blue: #40c4ff;
                    --neon-green: #00e676;
                    --neon-amber: #ffb300;
                    --neon-red: #ff3333;
                    --neon-purple: #7c4dff;
                    --border-glass: rgba(255, 255, 255, 0.08);
                }
                .glass-panel {
                    background: rgba(13, 25, 48, 0.7);
                    backdrop-filter: blur(20px);
                    border: 1px solid var(--border-glass);
                    box-shadow: 0 12px 32px rgba(0,0,0,0.4);
                }
                .badge {
                    font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 5px;
                    border: 1px solid transparent;
                }
                .badge-blue { background: rgba(64,196,255,0.1); color: var(--neon-blue); border-color: rgba(64,196,255,0.2); }
                .badge-green { background: rgba(0,230,118,0.1); color: var(--neon-green); border-color: rgba(0,230,118,0.2); }
                .badge-amber { background: rgba(255,179,0,0.1); color: var(--neon-amber); border-color: rgba(255,179,0,0.2); }
                .badge-red { background: rgba(255,51,51,0.1); color: var(--neon-red); border-color: rgba(255,51,51,0.2); }
                .badge-purple { background: rgba(124,77,255,0.1); color: var(--neon-purple); border-color: rgba(124,77,255,0.2); }
                
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
            `}</style>

            {showForensic && selectedCctv && (
                <ForensicModal
                    cctv={selectedCctv}
                    allCctv={displayCctv}
                    trackScopeOverride={prioritizedTrackScope}
                    routeFocusSummary={routeMonitoringPlan ? {
                        roadLabel: routeMonitoringPlan.roadLabel,
                        originLabel: routeMonitoringPlan.originLabel,
                        destinationLabel: routeMonitoringPlan.destinationLabel,
                        bundleCount: routeMonitoringPlan.bundleCount,
                        segmentCount: routeMonitoringPlan.segmentCount,
                        focusCount: routeMonitoringPlan.focusCount,
                        highIdentificationCount: routeMonitoringPlan.highIdentificationCount,
                        mediumIdentificationCount: routeMonitoringPlan.mediumIdentificationCount,
                        directionLabel: getRouteDirectionLabel(routeMonitoringPlan.resolvedDirection),
                        speedKph: routeMonitoringPlan.speedKph,
                        directionSourceLabel: getRouteDirectionSourceLabel(routeMonitoringPlan.directionSource),
                        immediateCount: routeMonitoringPlan.candidates.filter((candidate) => candidate.timeWindowLabel === '즉시').length,
                        shortCount: routeMonitoringPlan.candidates.filter((candidate) => candidate.timeWindowLabel === '단기').length,
                        scopeLabel: getRouteScopeLabel(routeScopeMode),
                        mediumCount: routeMonitoringPlan.candidates.filter((candidate) => candidate.timeWindowLabel === '중기').length,
                    } : null}
                    routeContext={forensicRouteContext}
                    backendEnabled={forensicStatus.enabled}
                    backendProvider={forensicStatus.provider}
                    backendMessage={forensicStatus.message}
                    backendOcr={forensicStatus.ocr}
                    onTrackingResultChange={setTrackingOverlay}
                    onLocate={handleLocate}
                    onClose={() => setShowForensic(false)}
                />
            )}
        </main>
    );
}
