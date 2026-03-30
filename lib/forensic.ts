import type {
    CctvItem,
    ForensicRouteContext,
    ForensicResult,
    ForensicStatusResponse,
    ForensicTrackCamera,
    ForensicTrackingResult,
} from '@/types/cctv';

const LIVE_FORENSIC_SOURCES = new Set([
    'National-ITS',
    'GG_KTICT',
    'gimpo-its-main',
    'gimpo-its-cross',
]);

function hasLiveStream(item: Pick<CctvItem, 'streamUrl' | 'hlsUrl'>) {
    return Boolean(item.hlsUrl?.trim() || item.streamUrl?.trim());
}

async function readJson<T>(res: Response): Promise<T> {
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
        const message =
            typeof (payload as { message?: unknown }).message === 'string'
                ? (payload as { message: string }).message
                : '포렌식 API 요청에 실패했습니다.';
        throw new Error(message);
    }
    return payload as T;
}

export function supportsVehicleForensic(item: Pick<CctvItem, 'type' | 'source' | 'streamUrl' | 'hlsUrl'>) {
    return item.type === 'traffic'
        && Boolean(item.source && LIVE_FORENSIC_SOURCES.has(item.source))
        && hasLiveStream(item);
}

export function buildForensicTrackScope(items: CctvItem[]): ForensicTrackCamera[] {
    return items
        .filter(supportsVehicleForensic)
        .map((item) => ({
            id: item.id,
            name: item.name,
            region: item.region,
            address: item.address,
            lat: item.lat,
            lng: item.lng,
            source: item.source,
            streamUrl: item.hlsUrl || item.streamUrl,
        }));
}

export async function getForensicStatus() {
    const res = await fetch('/api/forensic/status', {
        cache: 'no-store',
    });
    return readJson<ForensicStatusResponse>(res);
}

export async function analyzeCctv(
    cctvId: string,
    streamUrl: string,
    targetPlate?: string,
    targetColor?: string,
    targetVehicleType?: string,
    routeContext?: ForensicRouteContext,
) {
    const res = await fetch('/api/forensic/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            cctv_id: cctvId,
            hls_url: streamUrl,
            target_plate: targetPlate,
            target_color: targetColor,
            target_vehicle_type: targetVehicleType,
            route_context: routeContext,
        }),
    });

    return readJson<ForensicResult & Record<string, unknown>>(res);
}

export async function trackVehicle(payload: {
    plate?: string;
    color?: string;
    vehicleType?: string;
    originCctvId?: string;
    cctvList: ForensicTrackCamera[];
    routeContext?: ForensicRouteContext;
}) {
    const res = await fetch('/api/forensic/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            plate: payload.plate,
            color: payload.color,
            vehicle_type: payload.vehicleType,
            origin_cctv_id: payload.originCctvId,
            cctv_list: payload.cctvList,
            route_context: payload.routeContext,
        }),
    });

    return readJson<ForensicTrackingResult & Record<string, unknown>>(res);
}

export async function getTrackingResult(trackingId: string) {
    const res = await fetch(`/api/forensic/track/${encodeURIComponent(trackingId)}`, {
        cache: 'no-store',
    });
    return readJson<ForensicTrackingResult & Record<string, unknown>>(res);
}

export async function waitForTrackingResult(trackingId: string, attempts = 10, intervalMs = 1500) {
    let last: ForensicTrackingResult & Record<string, unknown> | null = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        last = await getTrackingResult(trackingId);
        if (last.status === 'completed' || last.status === 'error') {
            return last;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    if (last) return last;
    throw new Error('차량 추적 결과 대기 중 시간이 초과되었습니다.');
}
