import { createHash, randomUUID } from 'node:crypto';

type AnalyzeRequestPayload = {
    cctv_id?: string;
    hls_url?: string;
    target_plate?: string;
    target_color?: string;
    target_vehicle_type?: string;
};

type TrackCameraPayload = {
    id?: string;
    name?: string;
    region?: string;
    address?: string;
    lat?: number;
    lng?: number;
    source?: string;
    streamUrl?: string;
    expectedEtaMinutes?: number;
    timeWindowLabel?: string;
    travelOrder?: number;
    isRouteFocus?: boolean;
};

type RouteContextPayload = {
    roadLabel?: string;
    scopeLabel?: string;
    immediateIds?: string[];
    shortIds?: string[];
    mediumIds?: string[];
    followupIds?: string[];
};

type TrackRequestPayload = {
    plate?: string;
    color?: string;
    vehicle_type?: string;
    origin_cctv_id?: string;
    cctv_list?: TrackCameraPayload[];
    route_context?: RouteContextPayload;
};

type ForensicTrackStore = Map<string, Record<string, unknown>>;

declare global {
    // eslint-disable-next-line no-var
    var __forensicTrackStore: ForensicTrackStore | undefined;
}

function sha256(value: string) {
    return createHash('sha256').update(value).digest('hex');
}

function hashInt(seed: string, modulo: number, offset = 0) {
    const value = Number.parseInt(sha256(`${seed}:${offset}`).slice(0, 8), 16);
    return value % modulo;
}

function buildChainHash(...parts: string[]) {
    const inputHash = sha256(parts[0] ?? '');
    const resultHash = sha256(parts.slice(1).join('|'));
    const chainHash = sha256(`${inputHash}:${resultHash}`);
    const prevHash = sha256(chainHash.slice(0, 32));
    return {
        input_hash: inputHash,
        result_hash: resultHash,
        chain_hash: chainHash,
        prev_hash: prevHash,
    };
}

function getTrackStore() {
    if (!globalThis.__forensicTrackStore) {
        globalThis.__forensicTrackStore = new Map();
    }
    return globalThis.__forensicTrackStore;
}

function nowIso() {
    return new Date().toISOString();
}

export function isForensicFallbackAvailable() {
    return true;
}

export function createFallbackAnalyzeResponse(payload: AnalyzeRequestPayload) {
    const cctvId = payload.cctv_id?.trim() || 'unknown-cctv';
    const hlsUrl = payload.hls_url?.trim() || '';
    const seed = `${cctvId}|${hlsUrl}|${payload.target_plate || ''}|${payload.target_color || ''}|${payload.target_vehicle_type || ''}`;
    const totalInput = 18;
    const passed = 8 + hashInt(seed, 8, 1);
    const dropped = totalInput - passed;
    const vehicleCount = 1 + hashInt(seed, 4, 2);
    const confidence = Number((78 + hashInt(seed, 18, 3) + hashInt(seed, 10, 4) / 10).toFixed(1));
    const chain = buildChainHash(
        cctvId,
        hlsUrl,
        payload.target_plate || '',
        payload.target_color || '',
        payload.target_vehicle_type || '',
        String(vehicleCount),
    );

    return {
        job_id: `analysis-${randomUUID().slice(0, 12)}`,
        cctv_id: cctvId,
        timestamp: nowIso(),
        algorithm: 'nextjs-demo-yolo-fallback / synthetic-ocr / mfsr-chain',
        ...chain,
        tsa_status: 'local_fallback',
        generative_ai_used: false,
        quality_report: {
            total_input: totalInput,
            passed,
            dropped,
            threshold: 42.5,
        },
        events_detected: ['vehicle_detected', 'traffic_flow_sampled'],
        confidence,
        verdict: '내장 데모 차량 분석 완료',
        vehicle_count: vehicleCount,
        target_plate: payload.target_plate || null,
        target_color: payload.target_color || null,
        target_vehicle_type: payload.target_vehicle_type || null,
        plate_candidates: payload.target_plate ? [payload.target_plate] : [],
    };
}

export function createFallbackTrackResponse(payload: TrackRequestPayload) {
    const cameras = Array.isArray(payload.cctv_list) ? payload.cctv_list : [];
    const routeContext = payload.route_context ?? {};
    const seed = `${payload.origin_cctv_id || ''}|${payload.plate || ''}|${payload.color || ''}|${payload.vehicle_type || ''}|${cameras.length}`;
    const baseTime = Date.now();
    const maxHits = Math.min(Math.max(2, 2 + hashInt(seed, 3, 5)), Math.max(1, cameras.length));
    const hits = cameras
        .slice(0, maxHits)
        .map((camera, index) => ({
            id: `hit-${randomUUID().slice(0, 10)}`,
            cctv_id: camera.id || `camera-${index + 1}`,
            cctv_name: camera.name || `ITS CCTV ${index + 1}`,
            region: camera.region === '서울' || camera.region === '인천' ? camera.region : '김포',
            address: camera.address || '',
            timestamp: new Date(baseTime + index * 2 * 60_000).toISOString(),
            confidence: Number((74 + hashInt(seed, 21, 10 + index) + hashInt(seed, 10, 40 + index) / 10).toFixed(1)),
            plate: payload.plate || null,
            color: payload.color || null,
            vehicle_type: payload.vehicle_type || null,
            expected_eta_minutes: camera.expectedEtaMinutes ?? null,
            time_window_label: camera.timeWindowLabel ?? null,
        }));

    const result = {
        tracking_id: `track-${randomUUID().slice(0, 12)}`,
        status: 'completed',
        searched_cameras: cameras.length,
        hits,
        message: hits.length
            ? `${hits.length}건의 데모 이동 후보를 생성했습니다.${routeContext.roadLabel ? ` ${routeContext.roadLabel}` : ''}${routeContext.scopeLabel ? ` / ${routeContext.scopeLabel}` : ''} 기준 우선순위를 반영했습니다.`
            : '일치하는 차량 이동 후보가 없습니다.',
    };

    getTrackStore().set(result.tracking_id, result);
    return result;
}

export function readFallbackTrackResult(trackingId: string) {
    return getTrackStore().get(trackingId) ?? null;
}
