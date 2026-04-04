import type {
    CctvItem,
    ForensicRouteContext,
    ForensicTrackCamera,
    RoadPreset,
    RouteDirection,
    RouteScopeMode,
} from '@/types/cctv';
import { hasLiveTrafficStream } from '@/lib/traffic-sources';
import { getRoadPresetLabel, matchesRoadPreset } from '@/lib/road-presets';

export type RouteMonitoringCandidate = {
    id: string;
    name: string;
    region: CctvItem['region'];
    address: string;
    source?: string;
    distanceKm: number;
    routeDistanceKm: number;
    lateralOffsetMeters: number;
    travelOrder: number;
    isForward: boolean;
    focusScore: number;
    etaMinutes: number;
    timeWindowLabel: string;
};

export type RouteQuerySuggestion = {
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
};

export type RouteMonitoringPlan = {
    roadPreset: RoadPreset;
    roadLabel: string;
    originId: string;
    originLabel: string;
    startQuery: string;
    startMatched: boolean;
    startSuggestions: RouteQuerySuggestion[];
    destinationId: string | null;
    destinationLabel: string | null;
    destinationQuery: string;
    destinationMatched: boolean;
    destinationSuggestions: RouteQuerySuggestion[];
    bundleCount: number;
    segmentCount: number;
    focusCount: number;
    direction: RouteDirection;
    resolvedDirection: 'forward' | 'reverse';
    directionSource: 'manual' | 'token_hint' | 'density' | 'destination';
    speedKph: number;
    candidates: RouteMonitoringCandidate[];
    prioritizedIds: string[];
    focusIds: string[];
    immediateIds: string[];
    shortIds: string[];
    mediumIds: string[];
    followupIds: string[];
};

export function assessTravelWindow(expectedEtaMinutes?: number, observedMinutes?: number) {
    if (
        expectedEtaMinutes === undefined
        || expectedEtaMinutes === null
        || observedMinutes === undefined
        || observedMinutes === null
    ) {
        return {
            code: 'unknown' as const,
            label: '판단 보류',
        };
    }

    const delta = observedMinutes - expectedEtaMinutes;
    if (delta <= -3) {
        return { code: 'fast' as const, label: '예상보다 빠름' };
    }
    if (delta >= 6) {
        return { code: 'delayed' as const, label: '예상보다 지연' };
    }
    return { code: 'on_time' as const, label: '예상 범위' };
}

type RouteMonitoringOptions = {
    direction: RouteDirection;
    speedKph: number;
    startQuery?: string;
    destinationQuery?: string;
};

const ROAD_DIRECTION_HINTS: Partial<Record<RoadPreset, { forward: string[]; reverse: string[] }>> = {
    route48: {
        forward: ['서울', '검단', '인천', '부천'],
        reverse: ['강화', '통진', '대곶', '김포'],
    },
    airport: {
        forward: ['공항', '영종', '인천공항'],
        reverse: ['서울', '김포'],
    },
    secondGyeongin: {
        forward: ['인천', '공항', '청라'],
        reverse: ['안양', '광명', '서울'],
    },
    incheonBridge: {
        forward: ['영종', '공항', '인천대교'],
        reverse: ['송도', '인천'],
    },
    ring1: {
        forward: ['김포', '인천', '부평'],
        reverse: ['서울', '고양', '일산'],
    },
    outer2: {
        forward: ['검단', '인천', '김포'],
        reverse: ['파주', '일산', '고양'],
    },
};

function normalizeText(value: string) {
    return value
        .toLowerCase()
        .replace(/[()_\-.,·[\]]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getEtaWindowLabel(etaMinutes: number) {
    if (etaMinutes <= 3) return '즉시';
    if (etaMinutes <= 7) return '단기';
    if (etaMinutes <= 15) return '중기';
    return '후속';
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

function scoreRouteQueryMatch(item: CctvItem, query: string) {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return 0;

    const queryTokens = normalizedQuery.split(' ').filter((token) => token.length >= 2);
    const haystack = normalizeText(`${item.name} ${item.district} ${item.address}`);
    const nameText = normalizeText(item.name);
    const districtText = normalizeText(item.district);
    const addressText = normalizeText(item.address);

    let score = 0;

    if (nameText === normalizedQuery) score += 260;
    if (addressText.includes(normalizedQuery)) score += 180;
    if (haystack.includes(normalizedQuery)) score += 160;
    if (districtText.includes(normalizedQuery)) score += 80;

    for (const token of queryTokens) {
        if (nameText.includes(token)) score += 70;
        if (districtText.includes(token)) score += 45;
        if (addressText.includes(token)) score += 35;
    }

    return score;
}

function buildRouteQueryMatchReason(item: CctvItem, query: string) {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return undefined;

    const queryTokens = normalizedQuery.split(' ').filter((token) => token.length >= 2);
    const nameText = normalizeText(item.name);
    const districtText = normalizeText(item.district);
    const addressText = normalizeText(item.address);
    const matchedTokens = queryTokens.filter((token) =>
        nameText.includes(token) || districtText.includes(token) || addressText.includes(token)
    );

    const reasons: string[] = [];

    if (nameText === normalizedQuery) {
        reasons.push('이름 완전일치');
    } else if (nameText.includes(normalizedQuery)) {
        reasons.push('이름 일치');
    }

    if (addressText.includes(normalizedQuery)) {
        reasons.push('주소 일치');
    } else if (districtText.includes(normalizedQuery)) {
        reasons.push('지역 일치');
    }

    if (matchedTokens.length > 0) {
        reasons.push(`토큰: ${matchedTokens.slice(0, 3).join(', ')}`);
    }

    return reasons.join(' · ') || undefined;
}

function findRouteQueryMatch(items: CctvItem[], query?: string, excludeId?: string) {
    const trimmedQuery = query?.trim();
    if (!trimmedQuery) {
        return null;
    }

    const ranked = items
        .filter((item) => item.id !== excludeId)
        .map((item) => ({
            item,
            score: scoreRouteQueryMatch(item, trimmedQuery),
        }))
        .filter((candidate) => candidate.score >= 70)
        .sort((left, right) =>
            right.score - left.score
            || left.item.name.localeCompare(right.item.name, 'ko')
        );

    return ranked[0]?.item ?? null;
}

function findRouteQuerySuggestions(items: CctvItem[], query?: string, excludeId?: string) {
    const trimmedQuery = query?.trim();
    if (!trimmedQuery) {
        return [];
    }

    return items
        .filter((item) => item.id !== excludeId)
        .map((item) => ({
            item,
            score: scoreRouteQueryMatch(item, trimmedQuery),
        }))
        .filter((candidate) => candidate.score >= 70)
        .sort((left, right) =>
            right.score - left.score
            || left.item.name.localeCompare(right.item.name, 'ko')
        )
        .slice(0, 3)
        .map((candidate) => ({
            id: candidate.item.id,
            name: candidate.item.name,
            region: candidate.item.region,
            address: candidate.item.address,
            score: candidate.score,
            matchReason: buildRouteQueryMatchReason(candidate.item, trimmedQuery),
        }));
}

export function buildRouteQuerySuggestions(
    items: CctvItem[],
    roadPreset: RoadPreset,
    query?: string,
    options?: {
        excludeId?: string;
        referenceItem?: CctvItem | null;
    },
) {
    if (roadPreset === 'all') {
        return [];
    }

    const routePool = items.filter((item) =>
        item.type === 'traffic'
        && hasLiveTrafficStream(item)
        && matchesRoadPreset(item, roadPreset)
    );

    if (routePool.length === 0) {
        return [];
    }

    const routePoolById = new Map(routePool.map((item) => [item.id, item]));
    return findRouteQuerySuggestions(routePool, query, options?.excludeId).map((suggestion) => {
        const suggestionItem = routePoolById.get(suggestion.id);
        const distanceKm = options?.referenceItem && suggestionItem
            ? haversineKm(options.referenceItem.lat, options.referenceItem.lng, suggestionItem.lat, suggestionItem.lng)
            : undefined;

        return {
            ...suggestion,
            distanceKm: distanceKm !== undefined ? Number(distanceKm.toFixed(1)) : undefined,
        };
    });
}

function countTokenMatches(text: string, tokens: string[]) {
    return tokens.reduce((count, token) => count + (text.includes(token.toLowerCase()) ? 1 : 0), 0);
}

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

function toLocalMeters(originLat: number, originLng: number, lat: number, lng: number) {
    const latFactor = 111_320;
    const lngFactor = 111_320 * Math.cos((originLat * Math.PI) / 180);
    return {
        x: (lng - originLng) * lngFactor,
        y: (lat - originLat) * latFactor,
    };
}

function computePrincipalAxis(points: Array<{ x: number; y: number }>) {
    if (points.length < 2) {
        return { ux: 1, uy: 0 };
    }

    const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;

    let xx = 0;
    let yy = 0;
    let xy = 0;

    for (const point of points) {
        const dx = point.x - meanX;
        const dy = point.y - meanY;
        xx += dx * dx;
        yy += dy * dy;
        xy += dx * dy;
    }

    const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
    return {
        ux: Math.cos(angle),
        uy: Math.sin(angle),
    };
}

export function buildRouteMonitoringPlan(
    origin: CctvItem | null,
    items: CctvItem[],
    roadPreset: RoadPreset,
    options: RouteMonitoringOptions,
): RouteMonitoringPlan | null {
    if (roadPreset === 'all') {
        return null;
    }

    const routePool = items.filter((item) =>
        item.type === 'traffic'
        && hasLiveTrafficStream(item)
        && matchesRoadPreset(item, roadPreset)
    );

    if (routePool.length === 0) {
        return null;
    }

    const startQuery = options.startQuery?.trim() ?? '';
    const fallbackOrigin = origin && origin.type === 'traffic' && hasLiveTrafficStream(origin) && matchesRoadPreset(origin, roadPreset)
        ? origin
        : null;
    const queryMatchedStart = findRouteQueryMatch(routePool, startQuery);
    const startItem = queryMatchedStart ?? fallbackOrigin;

    const rawStartSuggestions = queryMatchedStart || !startQuery
        ? []
        : findRouteQuerySuggestions(routePool, startQuery, fallbackOrigin?.id);

    if (!startItem) {
        return null;
    }

    const routeItems = routePool.filter((item) => item.id !== startItem.id);
    const allRoutePoints = [startItem, ...routeItems];
    const projected = allRoutePoints.map((item) => ({
        id: item.id,
        ...toLocalMeters(startItem.lat, startItem.lng, item.lat, item.lng),
    }));
    const axis = computePrincipalAxis(projected.map(({ x, y }) => ({ x, y })));
    const perp = { x: -axis.uy, y: axis.ux };

    const normalizedSpeedKph = Math.min(120, Math.max(20, options.speedKph || 60));

    const destinationQuery = options.destinationQuery?.trim() ?? '';
    const destinationItem = findRouteQueryMatch(routePool, destinationQuery, startItem.id);
    const rawDestinationSuggestions = destinationItem
        ? []
        : findRouteQuerySuggestions(routePool, destinationQuery, startItem.id);

    const rawCandidates = routeItems
        .map((item) => {
            const relative = toLocalMeters(startItem.lat, startItem.lng, item.lat, item.lng);
            const forwardMeters = relative.x * axis.ux + relative.y * axis.uy;
            const lateralMeters = Math.abs(relative.x * perp.x + relative.y * perp.y);
            const routeDistanceKm = Math.abs(forwardMeters) / 1000;
            const distanceKm = haversineKm(startItem.lat, startItem.lng, item.lat, item.lng);
            const etaMinutes = routeDistanceKm > 0 ? Math.round((routeDistanceKm / normalizedSpeedKph) * 60) : 0;

            return {
                id: item.id,
                name: item.name,
                region: item.region,
                address: item.address,
                source: item.source,
                distanceKm,
                routeDistanceKm,
                signedForwardMeters: forwardMeters,
                lateralOffsetMeters: Math.round(lateralMeters),
                etaMinutes,
            };
        });

    const destinationSuggestions = rawDestinationSuggestions.map((suggestion) => {
        const candidate = rawCandidates.find((rawCandidate) => rawCandidate.id === suggestion.id);
        return {
            ...suggestion,
            routeDistanceKm: candidate ? Number(candidate.routeDistanceKm.toFixed(1)) : undefined,
            distanceKm: candidate ? Number(candidate.distanceKm.toFixed(1)) : undefined,
            etaMinutes: candidate?.etaMinutes,
            timeWindowLabel: candidate ? getEtaWindowLabel(candidate.etaMinutes) : undefined,
        };
    });

    const routePoolById = new Map(routePool.map((item) => [item.id, item]));
    const startSuggestions = rawStartSuggestions.map((suggestion) => {
        const suggestionItem = routePoolById.get(suggestion.id);
        const distanceKm = fallbackOrigin && suggestionItem
            ? haversineKm(fallbackOrigin.lat, fallbackOrigin.lng, suggestionItem.lat, suggestionItem.lng)
            : undefined;
        return {
            ...suggestion,
            distanceKm: distanceKm !== undefined ? Number(distanceKm.toFixed(1)) : undefined,
        };
    });

    let resolvedDirection: 'forward' | 'reverse' = 'forward';
    let directionSource: 'manual' | 'token_hint' | 'density' | 'destination' = 'density';

    const destinationCandidate = destinationItem
        ? rawCandidates.find((candidate) => candidate.id === destinationItem.id)
        : null;

    if (destinationCandidate && Math.abs(destinationCandidate.signedForwardMeters) > 25) {
        resolvedDirection = destinationCandidate.signedForwardMeters > 0 ? 'forward' : 'reverse';
        directionSource = 'destination';
    } else if (options.direction === 'forward' || options.direction === 'reverse') {
        resolvedDirection = options.direction;
        directionSource = 'manual';
    } else {
        const hint = ROAD_DIRECTION_HINTS[roadPreset];
        const originText = normalizeText(`${startItem.name} ${startItem.address}`);
        const forwardHintScore = hint ? countTokenMatches(originText, hint.forward) : 0;
        const reverseHintScore = hint ? countTokenMatches(originText, hint.reverse) : 0;

        if (forwardHintScore !== reverseHintScore) {
            resolvedDirection = forwardHintScore > reverseHintScore ? 'forward' : 'reverse';
            directionSource = 'token_hint';
        } else {
            const forwardDensity = rawCandidates
                .filter((candidate) => candidate.signedForwardMeters > 25)
                .reduce((sum, candidate) => sum + Math.max(0, 1 - candidate.routeDistanceKm / 12), 0);
            const reverseDensity = rawCandidates
                .filter((candidate) => candidate.signedForwardMeters < -25)
                .reduce((sum, candidate) => sum + Math.max(0, 1 - candidate.routeDistanceKm / 12), 0);
            resolvedDirection = forwardDensity >= reverseDensity ? 'forward' : 'reverse';
        }
    }

    const segmentLimitMeters = destinationCandidate ? Math.abs(destinationCandidate.signedForwardMeters) + 25 : null;

    const candidates = rawCandidates
        .filter((candidate) => {
            const directionAligned = resolvedDirection === 'forward'
                ? candidate.signedForwardMeters > 25
                : candidate.signedForwardMeters < -25;
            if (!directionAligned) {
                return false;
            }
            if (segmentLimitMeters === null) {
                return true;
            }
            return Math.abs(candidate.signedForwardMeters) <= segmentLimitMeters;
        })
        .map((candidate) => {
            const isForward = resolvedDirection === 'forward'
                ? candidate.signedForwardMeters > 25
                : candidate.signedForwardMeters < -25;
            const alignmentScore = Math.max(0, 1 - candidate.lateralOffsetMeters / 700);
            const rangeScore = Math.max(0, 1 - candidate.routeDistanceKm / 15);
            const directionScore = isForward ? 0.4 : 0;
            const focusScore = alignmentScore * 140 + rangeScore * 80 + directionScore * 100;

            return {
                id: candidate.id,
                name: candidate.name,
                region: candidate.region,
                address: candidate.address,
                source: candidate.source,
                distanceKm: candidate.distanceKm,
                routeDistanceKm: candidate.routeDistanceKm,
                lateralOffsetMeters: candidate.lateralOffsetMeters,
                travelOrder: 0,
                isForward,
                focusScore,
                etaMinutes: candidate.etaMinutes,
                timeWindowLabel: getEtaWindowLabel(candidate.etaMinutes),
            } satisfies RouteMonitoringCandidate;
        })
        .sort((left, right) =>
            Number(right.isForward) - Number(left.isForward)
            || left.lateralOffsetMeters - right.lateralOffsetMeters
            || left.routeDistanceKm - right.routeDistanceKm
            || left.distanceKm - right.distanceKm
        )
        .map((candidate, index) => ({
            ...candidate,
            travelOrder: index + 1,
        }));

    const focused = candidates.filter((candidate) => candidate.lateralOffsetMeters <= 500);
    const fallbackFocused = candidates.filter((candidate) => candidate.lateralOffsetMeters <= 700);
    const prioritizedFocus = (focused.length > 0 ? focused : fallbackFocused).slice(0, 8);
    const focusIds = prioritizedFocus.map((candidate) => candidate.id);
    const immediateIds = candidates
        .filter((candidate) => candidate.timeWindowLabel === '즉시')
        .map((candidate) => candidate.id);
    const shortIds = candidates
        .filter((candidate) => candidate.timeWindowLabel === '단기')
        .map((candidate) => candidate.id);
    const mediumIds = candidates
        .filter((candidate) => candidate.timeWindowLabel === '중기')
        .map((candidate) => candidate.id);
    const followupIds = candidates
        .filter((candidate) => candidate.timeWindowLabel === '후속')
        .map((candidate) => candidate.id);
    const prioritizedIds = [startItem.id, ...prioritizedFocus.map((candidate) => candidate.id), ...candidates.map((candidate) => candidate.id)]
        .filter((id, index, array) => array.indexOf(id) === index);

    return {
        roadPreset,
        roadLabel: getRoadPresetLabel(roadPreset),
        originId: startItem.id,
        originLabel: startItem.name,
        startQuery,
        startMatched: Boolean(queryMatchedStart) || !startQuery,
        startSuggestions,
        destinationId: destinationItem?.id ?? null,
        destinationLabel: destinationItem?.name ?? null,
        destinationQuery,
        destinationMatched: Boolean(destinationItem) || !destinationQuery,
        destinationSuggestions,
        bundleCount: routeItems.length + 1,
        segmentCount: candidates.length + 1,
        focusCount: prioritizedFocus.length,
        direction: options.direction,
        resolvedDirection,
        directionSource,
        speedKph: normalizedSpeedKph,
        candidates: candidates.slice(0, 12),
        prioritizedIds,
        focusIds,
        immediateIds,
        shortIds,
        mediumIds,
        followupIds,
    };
}

export function prioritizeTrackScope(
    trackScope: ForensicTrackCamera[],
    prioritizedIds: string[],
) {
    if (prioritizedIds.length === 0) {
        return trackScope;
    }

    const rank = new Map(prioritizedIds.map((id, index) => [id, index]));
    return [...trackScope].sort((left, right) =>
        (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    );
}

export function buildRouteScopedTrackScope(
    trackScope: ForensicTrackCamera[],
    plan: RouteMonitoringPlan,
    scopeMode: RouteScopeMode,
) {
    const candidateMap = new Map(plan.candidates.map((candidate) => [candidate.id, candidate]));
    const immediateAndShort = [...plan.immediateIds, ...plan.shortIds];
    const focusScopeIds = [
        plan.originId,
        ...immediateAndShort,
        ...plan.mediumIds.slice(0, Math.max(0, 8 - immediateAndShort.length)),
        ...plan.focusIds,
    ].filter((id, index, array) => array.indexOf(id) === index);

    const allowedIds = scopeMode === 'focus'
        ? new Set(focusScopeIds)
        : scopeMode === 'bundle'
            ? new Set([plan.originId, ...plan.prioritizedIds])
            : null;

    const scoped = allowedIds
        ? trackScope.filter((camera) => allowedIds.has(camera.id))
        : trackScope;

    const prioritized = prioritizeTrackScope(scoped, plan.prioritizedIds);

    return prioritized.map((camera) => {
        const candidate = candidateMap.get(camera.id);
        return {
            ...camera,
            expectedEtaMinutes: candidate?.etaMinutes,
            timeWindowLabel: candidate?.timeWindowLabel,
            travelOrder: candidate?.travelOrder,
            isRouteFocus: candidate ? plan.focusIds.includes(candidate.id) : false,
        };
    });
}

export function buildForensicRouteContext(
    plan: RouteMonitoringPlan,
    scopeMode: RouteScopeMode,
): ForensicRouteContext {
    return {
        roadPreset: plan.roadPreset,
        roadLabel: plan.roadLabel,
        originId: plan.originId,
        originLabel: plan.originLabel,
        destinationId: plan.destinationId,
        destinationLabel: plan.destinationLabel,
        direction: plan.resolvedDirection,
        directionSource: plan.directionSource,
        speedKph: plan.speedKph,
        scopeMode,
        scopeLabel: getRouteScopeLabel(scopeMode),
        bundleCount: plan.bundleCount,
        segmentCount: plan.segmentCount,
        focusCount: plan.focusCount,
        prioritizedIds: plan.prioritizedIds,
        focusIds: plan.focusIds,
        immediateIds: plan.immediateIds,
        shortIds: plan.shortIds,
        mediumIds: plan.mediumIds,
        followupIds: plan.followupIds,
    };
}
