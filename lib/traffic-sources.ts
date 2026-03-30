type TrafficCameraLike = {
    type?: string;
    source?: string | null;
    streamUrl?: string | null;
    hlsUrl?: string | null;
};

export const LIVE_TRAFFIC_SOURCES = [
    'National-ITS',
    'GG_KTICT',
    'gimpo-its-main',
    'gimpo-its-cross',
    'incheon-utic',
] as const;

export const MAP_ONLY_TRAFFIC_SOURCES = [
    'Gimpo-Local-Traffic',
    'Incheon-Local-Traffic',
] as const;

export function isLiveTrafficSource(source?: string | null): boolean {
    return !!source && LIVE_TRAFFIC_SOURCES.includes(source as (typeof LIVE_TRAFFIC_SOURCES)[number]);
}

export function isMapOnlyTrafficSource(source?: string | null): boolean {
    return !!source && MAP_ONLY_TRAFFIC_SOURCES.includes(source as (typeof MAP_ONLY_TRAFFIC_SOURCES)[number]);
}

export function hasLiveTrafficStream(camera: TrafficCameraLike): boolean {
    if (camera.type !== 'traffic' || !isLiveTrafficSource(camera.source)) {
        return false;
    }

    return Boolean(camera.hlsUrl || camera.streamUrl);
}

export function isMapOnlyTrafficCamera(camera: TrafficCameraLike): boolean {
    return camera.type === 'traffic' && isMapOnlyTrafficSource(camera.source);
}
