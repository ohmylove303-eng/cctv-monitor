// ─── CCTV 핵심 타입 ──────────────────────────────────────────────────────────
export type CctvType = 'crime' | 'fire' | 'traffic';
export type CctvStatus = '정상' | '점검중' | '고장';
export type CctvRegion = '김포' | '인천' | '서울';
export type RoadPreset = 'all' | 'route48' | 'ring1' | 'airport' | 'secondGyeongin' | 'incheonBridge' | 'outer2';
export type RouteDirection = 'auto' | 'forward' | 'reverse';
export type RouteScopeMode = 'focus' | 'bundle' | 'network';

export interface CctvItem {
    id: string;
    name: string;
    type: CctvType;
    status: CctvStatus;
    region: CctvRegion;
    district: string;
    address: string;
    operator: string;
    streamUrl: string;
    hlsUrl?: string;     // 실제 HLS .m3u8 URL (김포 ITS 연동)
    resolution?: string;
    installedYear?: number;
    lat: number;
    lng: number;
    source?: string;
    coordinateSource?: 'official' | 'its_api' | 'seed' | 'unknown';
    coordinateVerified?: boolean;
    coordinateNote?: string;
}

export interface ForensicTrackCamera {
    id: string;
    name: string;
    region: CctvRegion;
    address: string;
    lat: number;
    lng: number;
    source?: string;
    streamUrl: string;
    expectedEtaMinutes?: number;
    timeWindowLabel?: string;
    travelOrder?: number;
    isRouteFocus?: boolean;
    identificationScore?: number;
    identificationGrade?: 'high' | 'medium' | 'low';
    identificationReason?: string;
}

export interface ForensicRouteContext {
    roadPreset: RoadPreset;
    roadLabel: string;
    originId: string;
    originLabel: string;
    destinationId?: string | null;
    destinationLabel?: string | null;
    direction: 'forward' | 'reverse';
    directionSource: 'manual' | 'token_hint' | 'density' | 'destination';
    speedKph: number;
    scopeMode: RouteScopeMode;
    scopeLabel: string;
    bundleCount: number;
    segmentCount: number;
    focusCount: number;
    prioritizedIds: string[];
    focusIds: string[];
    immediateIds: string[];
    shortIds: string[];
    mediumIds: string[];
    followupIds: string[];
}

// ─── UI 상태 타입 ────────────────────────────────────────────────────────────
export interface LayerVisibility {
    crime: boolean;
    fire: boolean;
    traffic: boolean;
}

export interface RegionFilter {
    김포: boolean;
    인천: boolean;
    서울: boolean;
}

// ─── 포렌식 분석 결과 타입 ───────────────────────────────────────────────────
export interface ForensicQualityReport {
    total_input: number;
    passed: number;
    dropped: number;
    threshold: number;
}

export interface ForensicResult {
    job_id: string;
    cctv_id: string;
    timestamp: string;
    algorithm: string;
    input_hash: string;
    result_hash: string;
    chain_hash: string;
    prev_hash: string;
    tsa_status: 'verified' | 'demo_fallback' | 'yolo_active';
    generative_ai_used: boolean;
    quality_report: ForensicQualityReport;
    events_detected: string[];
    confidence: number;
    verdict: string;
    vehicle_count?: number;
    ocr_status?:
        | 'not_available'
        | 'target_hint_only'
        | 'ocr_active'
        | 'ocr_unavailable'
        | 'skipped_no_vehicle'
        | 'skipped_no_frames';
    ocr_engine?: string | null;
    target_plate?: string;
    target_color?: string;
    target_vehicle_type?: string;
    plate_candidates?: string[];
}

export interface ForensicTrackingHit {
    id: string;
    cctv_id: string;
    cctv_name: string;
    region: CctvRegion;
    address: string;
    timestamp: string;
    confidence: number;
    plate?: string;
    plate_candidates?: string[];
    color?: string;
    vehicle_type?: string;
    expected_eta_minutes?: number;
    time_window_label?: string;
    travel_assessment?: 'fast' | 'on_time' | 'delayed' | 'unknown';
    travel_assessment_label?: string;
}

export interface ForensicTrackingResult {
    tracking_id: string;
    status: 'queued' | 'processing' | 'completed' | 'error';
    searched_cameras: number;
    hits: ForensicTrackingHit[];
    message?: string;
}

export interface ForensicStatusResponse {
    enabled: boolean;
    provider: 'configured' | 'fallback' | 'missing';
    reachable?: boolean;
    httpStatus?: number;
    message: string;
}
