import { resolveSentinelBBox, resolveSentinelDate, type SentinelBBox } from '@/lib/sentinel';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOOKBACK_DAYS = 60;
const DEFAULT_MAX_CLOUD_COVER = 0.4;

type PlanetGeometry = {
    type: 'Polygon';
    coordinates: number[][][];
};

type PlanetFeature = {
    id: string;
    geometry?: {
        type?: string;
        coordinates?: unknown;
    };
    properties?: {
        acquired?: string;
        published?: string;
        cloud_cover?: number;
        gsd?: number;
        quality_category?: string;
    };
};

export function getPlanetConfig() {
    const rawLookbackDays = Number(process.env.PLANET_LOOKBACK_DAYS);
    const rawMaxCloudCover = Number(process.env.PLANET_MAX_CLOUD_COVER);

    return {
        apiKey: process.env.PLANET_API_KEY || process.env.PL_API_KEY || '',
        itemType: 'SkySatCollect',
        lookbackDays: Number.isFinite(rawLookbackDays) && rawLookbackDays > 0
            ? Math.round(rawLookbackDays)
            : DEFAULT_LOOKBACK_DAYS,
        maxCloudCover: Number.isFinite(rawMaxCloudCover) && rawMaxCloudCover >= 0 && rawMaxCloudCover <= 1
            ? rawMaxCloudCover
            : DEFAULT_MAX_CLOUD_COVER,
    };
}

export function resolvePlanetDate(rawDate: string | null) {
    return resolveSentinelDate(rawDate);
}

export function resolvePlanetBBox(rawBbox: string | null) {
    return resolveSentinelBBox(rawBbox);
}

function bboxToPolygon(bbox: SentinelBBox): PlanetGeometry {
    return {
        type: 'Polygon',
        coordinates: [[
            [bbox[0], bbox[1]],
            [bbox[2], bbox[1]],
            [bbox[2], bbox[3]],
            [bbox[0], bbox[3]],
            [bbox[0], bbox[1]],
        ]],
    };
}

export function buildPlanetQuickSearchBody(
    bbox: SentinelBBox,
    date: string,
    options?: { lookbackDays?: number; maxCloudCover?: number }
) {
    const lookbackDays = options?.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
    const maxCloudCover = options?.maxCloudCover ?? DEFAULT_MAX_CLOUD_COVER;
    const endDate = new Date(`${date}T23:59:59Z`);
    const startDate = new Date(endDate.getTime() - lookbackDays * DAY_MS);

    return {
        item_types: ['SkySatCollect'],
        filter: {
            type: 'AndFilter',
            config: [
                {
                    type: 'GeometryFilter',
                    field_name: 'geometry',
                    config: bboxToPolygon(bbox),
                },
                {
                    type: 'DateRangeFilter',
                    field_name: 'acquired',
                    config: {
                        gte: startDate.toISOString(),
                        lte: endDate.toISOString(),
                    },
                },
                {
                    type: 'RangeFilter',
                    field_name: 'cloud_cover',
                    config: {
                        lte: maxCloudCover,
                    },
                },
            ],
        },
    };
}

function geometryToBbox(geometry: PlanetFeature['geometry']) {
    if (!geometry || !Array.isArray(geometry.coordinates)) return null;

    const ring = geometry.type === 'Polygon'
        ? geometry.coordinates[0]
        : null;

    if (!Array.isArray(ring)) return null;

    const points = ring.filter((point): point is [number, number] =>
        Array.isArray(point)
        && point.length >= 2
        && Number.isFinite(point[0])
        && Number.isFinite(point[1])
    );

    if (points.length === 0) return null;

    const longitudes = points.map(point => point[0]);
    const latitudes = points.map(point => point[1]);

    return [
        Number(Math.min(...longitudes).toFixed(6)),
        Number(Math.min(...latitudes).toFixed(6)),
        Number(Math.max(...longitudes).toFixed(6)),
        Number(Math.max(...latitudes).toFixed(6)),
    ] as const;
}

export function selectPlanetItem(features: PlanetFeature[]) {
    if (features.length === 0) return null;

    const preferred = [...features].sort((a, b) => {
        const aQuality = a.properties?.quality_category === 'standard' ? 0 : 1;
        const bQuality = b.properties?.quality_category === 'standard' ? 0 : 1;
        if (aQuality !== bQuality) return aQuality - bQuality;

        const aAcquired = Date.parse(a.properties?.acquired ?? '') || 0;
        const bAcquired = Date.parse(b.properties?.acquired ?? '') || 0;
        if (aAcquired !== bAcquired) return bAcquired - aAcquired;

        return (a.properties?.cloud_cover ?? 1) - (b.properties?.cloud_cover ?? 1);
    });

    const selected = preferred[0];
    return {
        id: selected.id,
        acquired: selected.properties?.acquired ?? null,
        published: selected.properties?.published ?? null,
        cloudCover: selected.properties?.cloud_cover ?? null,
        gsd: selected.properties?.gsd ?? null,
        qualityCategory: selected.properties?.quality_category ?? null,
        coverageBbox: geometryToBbox(selected.geometry),
        geometry: selected.geometry ?? null,
    };
}
