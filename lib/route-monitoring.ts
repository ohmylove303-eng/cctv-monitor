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

export type RouteMonitoringPlan = {
    roadPreset: RoadPreset;
    roadLabel: string;
    originId: string;
    bundleCount: number;
    focusCount: number;
    direction: RouteDirection;
    resolvedDirection: 'forward' | 'reverse';
    directionSource: 'manual' | 'token_hint' | 'density';
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
    if (!origin || roadPreset === 'all') {
        return null;
    }

    if (origin.type !== 'traffic' || !hasLiveTrafficStream(origin) || !matchesRoadPreset(origin, roadPreset)) {
        return null;
    }

    const routeItems = items.filter((item) =>
        item.id !== origin.id
        && item.type === 'traffic'
        && hasLiveTrafficStream(item)
        && matchesRoadPreset(item, roadPreset)
    );

    if (routeItems.length === 0) {
        return null;
    }

    const allRoutePoints = [origin, ...routeItems];
    const projected = allRoutePoints.map((item) => ({
        id: item.id,
        ...toLocalMeters(origin.lat, origin.lng, item.lat, item.lng),
    }));
    const axis = computePrincipalAxis(projected.map(({ x, y }) => ({ x, y })));
    const perp = { x: -axis.uy, y: axis.ux };

    const normalizedSpeedKph = Math.min(120, Math.max(20, options.speedKph || 60));

    const rawCandidates = routeItems
        .map((item) => {
            const relative = toLocalMeters(origin.lat, origin.lng, item.lat, item.lng);
            const forwardMeters = relative.x * axis.ux + relative.y * axis.uy;
            const lateralMeters = Math.abs(relative.x * perp.x + relative.y * perp.y);
            const routeDistanceKm = Math.abs(forwardMeters) / 1000;
            const distanceKm = haversineKm(origin.lat, origin.lng, item.lat, item.lng);
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

    let resolvedDirection: 'forward' | 'reverse' = 'forward';
    let directionSource: 'manual' | 'token_hint' | 'density' = 'density';

    if (options.direction === 'forward' || options.direction === 'reverse') {
        resolvedDirection = options.direction;
        directionSource = 'manual';
    } else {
        const hint = ROAD_DIRECTION_HINTS[roadPreset];
        const originText = normalizeText(`${origin.name} ${origin.address}`);
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

    const candidates = rawCandidates
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

    const focused = candidates.filter((candidate) => candidate.isForward && candidate.lateralOffsetMeters <= 500);
    const fallbackFocused = candidates.filter((candidate) => candidate.lateralOffsetMeters <= 500);
    const prioritizedFocus = (focused.length > 0 ? focused : fallbackFocused).slice(0, 8);
    const focusIds = prioritizedFocus.map((candidate) => candidate.id);
    const forwardCandidates = candidates.filter((candidate) => candidate.isForward);
    const immediateIds = forwardCandidates
        .filter((candidate) => candidate.timeWindowLabel === '즉시')
        .map((candidate) => candidate.id);
    const shortIds = forwardCandidates
        .filter((candidate) => candidate.timeWindowLabel === '단기')
        .map((candidate) => candidate.id);
    const mediumIds = forwardCandidates
        .filter((candidate) => candidate.timeWindowLabel === '중기')
        .map((candidate) => candidate.id);
    const followupIds = forwardCandidates
        .filter((candidate) => candidate.timeWindowLabel === '후속')
        .map((candidate) => candidate.id);
    const prioritizedIds = [origin.id, ...prioritizedFocus.map((candidate) => candidate.id), ...candidates.map((candidate) => candidate.id)]
        .filter((id, index, array) => array.indexOf(id) === index);

    return {
        roadPreset,
        roadLabel: getRoadPresetLabel(roadPreset),
        originId: origin.id,
        bundleCount: routeItems.length + 1,
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
        direction: plan.resolvedDirection,
        directionSource: plan.directionSource,
        speedKph: plan.speedKph,
        scopeMode,
        scopeLabel: getRouteScopeLabel(scopeMode),
        bundleCount: plan.bundleCount,
        focusCount: plan.focusCount,
        prioritizedIds: plan.prioritizedIds,
        focusIds: plan.focusIds,
        immediateIds: plan.immediateIds,
        shortIds: plan.shortIds,
        mediumIds: plan.mediumIds,
        followupIds: plan.followupIds,
    };
}
