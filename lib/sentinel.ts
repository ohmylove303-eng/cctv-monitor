const DAY_MS = 24 * 60 * 60 * 1000;

export const SENTINEL_REGION_BBOX = [126.35, 37.3, 127.05, 37.85] as const;
export const SENTINEL_DEFAULT_WIDTH = 1024;
export const SENTINEL_DEFAULT_HEIGHT = 1024;
export const SENTINEL_MAX_DIMENSION = 2048;
const SENTINEL_MIN_SPAN = 0.0005;

export type SentinelBBox = readonly [number, number, number, number];
export type SentinelCoordinates = [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
];

export const SENTINEL_IMAGE_COORDINATES = buildSentinelImageCoordinates(SENTINEL_REGION_BBOX);

export const SENTINEL_DEFAULT_LAYER = 'TRUE_COLOR';

export function getSentinelConfig() {
    return {
        clientId: process.env.SENTINEL_CLIENT_ID || process.env.SENTINEL_HUB_CLIENT_ID || '',
        clientSecret: process.env.SENTINEL_CLIENT_SECRET || process.env.SENTINEL_HUB_CLIENT_SECRET || '',
        instanceId: process.env.SENTINEL_INSTANCE_ID || process.env.SENTINEL_HUB_INSTANCE_ID || '',
        layer: process.env.SENTINEL_LAYER || SENTINEL_DEFAULT_LAYER,
    };
}

export function resolveSentinelDate(rawDate: string | null): string {
    if (!rawDate) return new Date().toISOString().slice(0, 10);

    const parsed = new Date(`${rawDate}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
        return new Date().toISOString().slice(0, 10);
    }

    return parsed.toISOString().slice(0, 10);
}

export function buildSentinelTimeRange(date: string) {
    const endDate = new Date(`${date}T23:59:59Z`);
    const startDate = new Date(endDate.getTime() - 10 * DAY_MS);

    return {
        from: startDate.toISOString(),
        to: endDate.toISOString(),
    };
}

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

export function buildSentinelImageCoordinates(bbox: SentinelBBox): SentinelCoordinates {
    return [
        [bbox[0], bbox[3]],
        [bbox[2], bbox[3]],
        [bbox[2], bbox[1]],
        [bbox[0], bbox[1]],
    ];
}

export function resolveSentinelBBox(rawBbox: string | null): SentinelBBox {
    if (!rawBbox) return [...SENTINEL_REGION_BBOX];

    const values = rawBbox.split(',').map(value => Number(value.trim()));
    if (values.length !== 4 || values.some(value => !Number.isFinite(value))) {
        return [...SENTINEL_REGION_BBOX];
    }

    const [westInput, southInput, eastInput, northInput] = values;
    let west = clamp(Math.min(westInput, eastInput), -180, 180);
    let east = clamp(Math.max(westInput, eastInput), -180, 180);
    let south = clamp(Math.min(southInput, northInput), -85, 85);
    let north = clamp(Math.max(southInput, northInput), -85, 85);

    if (east - west < SENTINEL_MIN_SPAN) {
        const center = (west + east) / 2;
        west = clamp(center - SENTINEL_MIN_SPAN / 2, -180, 180);
        east = clamp(center + SENTINEL_MIN_SPAN / 2, -180, 180);
    }

    if (north - south < SENTINEL_MIN_SPAN) {
        const center = (south + north) / 2;
        south = clamp(center - SENTINEL_MIN_SPAN / 2, -85, 85);
        north = clamp(center + SENTINEL_MIN_SPAN / 2, -85, 85);
    }

    return [
        Number(west.toFixed(6)),
        Number(south.toFixed(6)),
        Number(east.toFixed(6)),
        Number(north.toFixed(6)),
    ];
}

export function resolveSentinelOutputSize(rawWidth: string | null, rawHeight: string | null) {
    const parsedWidth = Number(rawWidth);
    const parsedHeight = Number(rawHeight);

    let width = Number.isFinite(parsedWidth) && parsedWidth > 0
        ? Math.round(parsedWidth)
        : SENTINEL_DEFAULT_WIDTH;
    let height = Number.isFinite(parsedHeight) && parsedHeight > 0
        ? Math.round(parsedHeight)
        : SENTINEL_DEFAULT_HEIGHT;

    const maxDimension = Math.max(width, height);
    if (maxDimension > SENTINEL_MAX_DIMENSION) {
        const scale = SENTINEL_MAX_DIMENSION / maxDimension;
        width = Math.max(256, Math.round(width * scale));
        height = Math.max(256, Math.round(height * scale));
    }

    return {
        width: clamp(width, 256, SENTINEL_MAX_DIMENSION),
        height: clamp(height, 256, SENTINEL_MAX_DIMENSION),
    };
}

export function buildSentinelProcessPayload(
    date: string,
    options?: { bbox?: SentinelBBox; width?: number; height?: number }
) {
    const { from, to } = buildSentinelTimeRange(date);
    const bbox = options?.bbox ?? [...SENTINEL_REGION_BBOX];
    const width = options?.width ?? SENTINEL_DEFAULT_WIDTH;
    const height = options?.height ?? SENTINEL_DEFAULT_HEIGHT;

    return {
        input: {
            bounds: {
                bbox: [...bbox],
                properties: {
                    crs: 'http://www.opengis.net/def/crs/EPSG/0/4326',
                },
            },
            data: [
                {
                    type: 'sentinel-2-l2a',
                    dataFilter: {
                        timeRange: { from, to },
                        maxCloudCoverage: 35,
                        mosaickingOrder: 'leastCC',
                    },
                },
            ],
        },
        output: {
            width,
            height,
            responses: [
                {
                    identifier: 'default',
                    format: { type: 'image/png' },
                },
            ],
        },
        evalscript: [
            '//VERSION=3',
            'function setup() {',
            '  return {',
            '    input: ["B04", "B03", "B02"],',
            '    output: { bands: 3 }',
            '  };',
            '}',
            'function evaluatePixel(sample) {',
            '  return [2.5 * sample.B04, 2.5 * sample.B03, 2.5 * sample.B02];',
            '}',
        ].join('\n'),
    };
}
