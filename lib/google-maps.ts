export type GoogleBasemapStyle = 'satellite' | 'hybrid';

type CachedGoogleTileSession = {
    token: string;
    tileWidth: number;
    tileHeight: number;
    imageFormat: string;
    expiryAt: number;
};

type GoogleViewportRect = {
    north: number;
    south: number;
    east: number;
    west: number;
    maxZoom: number;
};

type GoogleViewportResponse = {
    copyright?: string;
    maxZoomRects?: GoogleViewportRect[];
};

const GOOGLE_TILE_API_BASE = 'https://tile.googleapis.com';
const GOOGLE_DEFAULT_MAX_ZOOM = 22;
const GOOGLE_SESSION_REFRESH_BUFFER_MS = 15 * 60 * 1000;
const GOOGLE_SESSION_FALLBACK_TTL_MS = 12 * 60 * 60 * 1000;

const sessionCache = new Map<GoogleBasemapStyle, CachedGoogleTileSession>();

export function getGoogleMapsConfig() {
    const apiKey =
        process.env.GOOGLE_MAPS_API_KEY?.trim()
        || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()
        || '';

    return {
        apiKey,
        language: process.env.GOOGLE_MAPS_TILE_LANGUAGE?.trim() || 'ko-KR',
        region: process.env.GOOGLE_MAPS_TILE_REGION?.trim() || 'KR',
    };
}

export function hasGoogleMapsApiKey() {
    return Boolean(getGoogleMapsConfig().apiKey);
}

function isGoogleBasemapStyle(value: string): value is GoogleBasemapStyle {
    return value === 'satellite' || value === 'hybrid';
}

export function resolveGoogleBasemapStyle(value: string | null): GoogleBasemapStyle {
    if (value && isGoogleBasemapStyle(value)) {
        return value;
    }

    return 'satellite';
}

function resolveSessionExpiry(rawValue: unknown) {
    if (typeof rawValue === 'string') {
        const asDate = Date.parse(rawValue);
        if (Number.isFinite(asDate)) {
            return asDate;
        }

        const asNumber = Number(rawValue);
        if (Number.isFinite(asNumber) && asNumber > 0) {
            return asNumber > 1e12 ? asNumber : asNumber * 1000;
        }
    }

    if (typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue > 0) {
        return rawValue > 1e12 ? rawValue : rawValue * 1000;
    }

    return Date.now() + GOOGLE_SESSION_FALLBACK_TTL_MS;
}

function buildSessionPayload(style: GoogleBasemapStyle, language: string, region: string) {
    if (style === 'hybrid') {
        return {
            mapType: 'satellite',
            language,
            region,
            imageFormat: 'png',
            highDpi: true,
            layerTypes: ['layerRoadmap'],
            overlay: false,
        };
    }

    return {
        mapType: 'satellite',
        language,
        region,
        imageFormat: 'jpeg',
        highDpi: true,
    };
}

async function createGoogleTileSession(style: GoogleBasemapStyle): Promise<CachedGoogleTileSession> {
    const { apiKey, language, region } = getGoogleMapsConfig();

    if (!apiKey) {
        throw new Error('GOOGLE_MAPS_API_KEY is not configured');
    }

    const response = await fetch(`${GOOGLE_TILE_API_BASE}/v1/createSession?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        cache: 'no-store',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildSessionPayload(style, language, region)),
    });

    const payload = await response.json().catch(() => null) as {
        session?: string;
        expiry?: string | number;
        tileWidth?: number;
        tileHeight?: number;
        imageFormat?: string;
        error?: { message?: string };
    } | null;

    if (!response.ok || !payload?.session) {
        throw new Error(
            payload?.error?.message
            ?? `Google session creation failed (${response.status})`
        );
    }

    return {
        token: payload.session,
        tileWidth: payload.tileWidth ?? 256,
        tileHeight: payload.tileHeight ?? 256,
        imageFormat: payload.imageFormat ?? 'png',
        expiryAt: resolveSessionExpiry(payload.expiry),
    };
}

export async function getGoogleTileSession(style: GoogleBasemapStyle) {
    const cached = sessionCache.get(style);
    if (cached && cached.expiryAt - GOOGLE_SESSION_REFRESH_BUFFER_MS > Date.now()) {
        return cached;
    }

    const nextSession = await createGoogleTileSession(style);
    sessionCache.set(style, nextSession);
    return nextSession;
}

function parseBound(value: string | null, name: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`${name} is required`);
    }
    return parsed;
}

export function resolveGoogleViewportRequest(searchParams: URLSearchParams) {
    const north = parseBound(searchParams.get('north'), 'north');
    const south = parseBound(searchParams.get('south'), 'south');
    const east = parseBound(searchParams.get('east'), 'east');
    const west = parseBound(searchParams.get('west'), 'west');
    const rawZoom = Number(searchParams.get('zoom'));
    const zoom = Number.isFinite(rawZoom)
        ? Math.max(0, Math.min(GOOGLE_DEFAULT_MAX_ZOOM, Math.ceil(rawZoom)))
        : 0;

    return { north, south, east, west, zoom };
}

function rectContainsPoint(rect: GoogleViewportRect, latitude: number, longitude: number) {
    return (
        latitude <= rect.north &&
        latitude >= rect.south &&
        longitude <= rect.east &&
        longitude >= rect.west
    );
}

function resolveSafeGoogleMaxZoom(
    maxZoomRects: GoogleViewportRect[] | undefined,
    bounds: ReturnType<typeof resolveGoogleViewportRequest>
) {
    const rects = maxZoomRects ?? [];
    const centerLatitude = (bounds.north + bounds.south) / 2;
    const centerLongitude = (bounds.east + bounds.west) / 2;
    const matchingRects = rects.filter((rect) => rectContainsPoint(rect, centerLatitude, centerLongitude));
    const candidates = (matchingRects.length > 0 ? matchingRects : rects)
        .map((rect) => rect.maxZoom)
        .filter((value) => Number.isFinite(value));

    return candidates.length > 0
        ? Math.max(...candidates)
        : GOOGLE_DEFAULT_MAX_ZOOM;
}

export async function fetchGoogleViewportInfo(
    style: GoogleBasemapStyle,
    bounds: ReturnType<typeof resolveGoogleViewportRequest>
) {
    const { apiKey } = getGoogleMapsConfig();

    if (!apiKey) {
        throw new Error('GOOGLE_MAPS_API_KEY is not configured');
    }

    const session = await getGoogleTileSession(style);
    const requestUrl = new URL(`${GOOGLE_TILE_API_BASE}/tile/v1/viewport`);
    requestUrl.searchParams.set('session', session.token);
    requestUrl.searchParams.set('key', apiKey);
    requestUrl.searchParams.set('zoom', String(bounds.zoom));
    requestUrl.searchParams.set('north', String(bounds.north));
    requestUrl.searchParams.set('south', String(bounds.south));
    requestUrl.searchParams.set('east', String(bounds.east));
    requestUrl.searchParams.set('west', String(bounds.west));

    const response = await fetch(requestUrl, {
        cache: 'no-store',
        headers: {
            Accept: 'application/json',
        },
    });

    const payload = await response.json().catch(() => null) as (GoogleViewportResponse & {
        error?: { message?: string };
    }) | null;

    if (!response.ok) {
        throw new Error(
            payload?.error?.message
            ?? `Google viewport fetch failed (${response.status})`
        );
    }

    return {
        session,
        copyright: payload?.copyright ?? null,
        safeMaxZoom: resolveSafeGoogleMaxZoom(payload?.maxZoomRects, bounds),
    };
}
