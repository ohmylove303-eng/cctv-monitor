// ─── CCTV 핵심 타입 ──────────────────────────────────────────────────────────
export type CctvType = 'crime' | 'fire' | 'traffic';
export type CctvStatus = '정상' | '점검중' | '고장';
export type CctvRegion = '김포' | '인천' | '서울';
export type RoadPreset = 'all' | 'route48' | 'ring1' | 'airport' | 'secondGyeongin' | 'incheonBridge' | 'outer2';
export type RouteDirection = 'auto' | 'forward' | 'reverse';
export type RouteScopeMode = 'focus' | 'bundle' | 'network';
export type CctvVisionTier = 'tier_a' | 'tier_b' | 'tier_c';
export type CctvDirectionCalibrationStatus = 'none' | 'pending' | 'calibrated';
export type LaneDirectionStatus = 'unknown' | 'calibrated';
export type LaneDirectionSource = 'vision_line_zone' | 'not_calibrated';
export type RouteDeviationRisk = 'unknown' | 'low' | 'medium' | 'high';
export type TrafficCongestionStatus = 'unavailable' | 'inferred' | 'verified';
export type TrafficCongestionLevel = 'low' | 'medium' | 'high';
export type TrafficCongestionSource = 'none' | 'eta_spacing' | 'external_traffic_api';

export interface CctvLineZone {
    label: 'forward' | 'reverse';
    points: [[number, number], [number, number]];
}

export interface CctvVisionCalibration {
    taxonomy: 'cctv_vision_calibration_v1';
    status: 'active';
    visionTier: CctvVisionTier;
    identificationUse: 'fine_grained_vehicle' | 'vehicle_shape_direction' | 'traffic_flow_only';
    approachDistanceMeters: number;
    resolution: {
        width: number;
        height: number;
    };
    directionCalibrationStatus: CctvDirectionCalibrationStatus;
    lineZones?: {
        forward?: CctvLineZone;
        reverse?: CctvLineZone;
    };
    evidence: {
        source: string;
        verificationMethod: string;
        sampleCount: number;
        datasetPath: string;
        reviewer: string;
        reviewedAt: string;
        notes?: string;
    };
}

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
    visionCalibration?: CctvVisionCalibration;
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
    laneDirectionStatus?: LaneDirectionStatus;
    laneDirectionLabel?: 'forward' | 'reverse';
    laneDirectionSource?: LaneDirectionSource;
    delayRiskScore?: number;
    routeDeviationRisk?: RouteDeviationRisk;
    trafficCongestionStatus?: TrafficCongestionStatus;
    trafficCongestionLevel?: TrafficCongestionLevel;
    trafficCongestionSource?: TrafficCongestionSource;
    visionCalibration?: CctvVisionCalibration;
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

export interface ForensicVehicleSignature {
    detector: 'yolo';
    taxonomy: 'coco_vehicle';
    detected_labels: string[];
    generic_vehicle_type?: string | null;
    make?: string | null;
    model?: string | null;
    subtype?: string | null;
    verification_status: 'detector_only' | 'target_hint_only' | 'needs_reference_data';
    reference_catalog_status?: 'missing' | 'empty' | 'loaded';
    vmmr_readiness_status?: 'missing' | 'empty' | 'no_active_model' | 'active_report_ready';
    vmmr_active_model_count?: number;
    fine_grained_model_ready?: boolean;
    reid_readiness_status?: 'missing' | 'empty' | 'no_active_model' | 'active_report_ready';
    reid_active_model_count?: number;
    same_vehicle_reid_ready?: boolean;
    reid_runtime_status?: 'disabled' | 'readiness_not_active' | 'model_not_configured' | 'model_file_missing' | 'model_dimension_mismatch' | 'runtime_ready';
    reid_match_status?: 'disabled' | 'no_crop' | 'no_embedding' | 'unmatched' | 'matched';
    reid_match_score?: number | null;
    reid_match_threshold?: number | null;
    reid_match_gallery_entries?: number | null;
    reid_match_reference_id?: string | null;
    reid_match_reference_cctv_id?: string | null;
    reid_match_reference_timestamp?: string | null;
    reid_embedding_backend?: string | null;
    reid_embedding_dimension?: number | null;
    reid_stored_entry_id?: string | null;
    evidence: string[];
}

export interface ForensicOcrDiagnostics {
    frame_batches: number;
    observation_count: number;
    raw_candidate_count: number;
    viable_candidate_count: number;
    final_candidate_count: number;
    suppressed_region_variants: number;
    top_candidate_support: number;
    top_candidate_weight: number;
    top_candidate_reason?: string | null;
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
    ocr_diagnostics?: ForensicOcrDiagnostics | null;
    target_plate?: string;
    target_color?: string;
    target_vehicle_type?: string;
    plate_candidates?: string[];
    vehicle_signature?: ForensicVehicleSignature | null;
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
    travel_order?: number;
    is_route_focus?: boolean;
    ocr_status?: ForensicResult['ocr_status'];
    ocr_engine?: string | null;
    ocr_diagnostics?: ForensicOcrDiagnostics | null;
    lane_direction_status?: LaneDirectionStatus;
    lane_direction_label?: 'forward' | 'reverse';
    lane_direction_source?: LaneDirectionSource;
    delay_risk_score?: number;
    route_deviation_risk?: RouteDeviationRisk;
    traffic_congestion_status?: TrafficCongestionStatus;
    traffic_congestion_level?: TrafficCongestionLevel;
    traffic_congestion_source?: TrafficCongestionSource;
    vehicle_signature?: ForensicVehicleSignature | null;
    delayRiskScore?: number;
    routeDeviationRisk?: RouteDeviationRisk;
}

export interface ForensicTrackingResult {
    tracking_id: string;
    status: 'queued' | 'processing' | 'completed' | 'error';
    searched_cameras: number;
    origin_cctv_id?: string;
    origin_cctv_name?: string;
    origin_timestamp?: string;
    hits: ForensicTrackingHit[];
    message?: string;
}

export interface ForensicOcrRuntimeState {
    engine?: string | null;
    configured?: boolean;
    attempted?: boolean;
    ready?: boolean;
    lazy_load?: boolean;
    status?: string | null;
    error?: string | null;
    operational_scope?: string | null;
    verification_status?: string | null;
    validation_note?: string | null;
    backtest_status?: string | null;
    backtest_active_report_count?: number;
    backtest_required_buckets?: string[] | null;
    backtest_completed_buckets?: string[] | null;
    backtest_runtime_integrated?: boolean;
    backtest_verification_status?: string | null;
    backtest_validation_note?: string | null;
    backtest_engine_comparison_count?: number;
    backtest_engine_comparisons?: Array<{
        engine: string;
        sampleCount: number;
        exactPlateAccuracy: number;
        candidateRecall: number;
        falsePositiveRate: number;
    }>;
}

export interface ForensicVehicleReferenceStatus {
    status?: 'missing' | 'empty' | 'loaded' | string;
    path?: string;
    entries?: number;
    error?: string | null;
}

export interface ForensicVehicleVmmrReadinessStatus {
    status?: 'missing' | 'empty' | 'no_active_model' | 'active_report_ready' | string;
    path?: string;
    datasets?: number;
    model_reports?: number;
    active_models?: number;
    activation_threshold?: number;
    fine_grained_model_ready?: boolean;
    error?: string | null;
}

export interface ForensicVehicleReidReadinessStatus {
    status?: 'missing' | 'empty' | 'no_active_model' | 'active_report_ready' | string;
    path?: string;
    datasets?: number;
    model_reports?: number;
    active_models?: number;
    activation_threshold?: number;
    max_false_positive_rate?: number;
    same_vehicle_reid_ready?: boolean;
    runtime_integrated?: boolean;
    error?: string | null;
}

export interface ForensicVehicleReidRuntimeStatus {
    taxonomy?: 'vehicle_reid_runtime_v1' | string;
    backend?: 'baseline' | string;
    status?: 'disabled' | 'readiness_not_active' | 'model_not_configured' | 'model_file_missing' | 'model_dimension_mismatch' | 'runtime_ready' | string;
    enabled?: boolean;
    configured?: boolean;
    model_path?: string | null;
    embedding_dimension?: number | null;
    gallery_path?: string | null;
    gallery_entries?: number;
    match_threshold?: number | null;
    readiness_status?: string | null;
    readiness_active_models?: number;
    runtime_integrated?: boolean;
    validation_note?: string | null;
    error?: string | null;
}

export interface ForensicVehicleReidRuntimeBacktestStatus {
    taxonomy?: 'vehicle_reid_runtime_backtest_report_v1' | string;
    status?: 'pending_review' | 'review_needed' | 'active' | 'candidate' | 'rejected' | 'keep_hidden' | string;
    path?: string | null;
    configured?: boolean;
    active_report_count?: number;
    required_buckets?: string[] | null;
    completed_buckets?: string[] | null;
    runtime_integrated?: boolean;
    verification_status?: string | null;
    validation_note?: string | null;
    runtime_backend?: string | null;
    match_threshold?: number | null;
    sample_count_total?: number;
    reviewed_sample_count?: number;
    missing_observation_count?: number;
    match_success_rate?: number | null;
    false_positive_rate?: number | null;
    false_negative_rate?: number | null;
    gallery_growth?: number;
    error?: string | null;
}

export interface ForensicTrackingStoreStatus {
    backend?: 'memory' | 'json_file' | 'postgres' | string;
    requested_backend?: 'auto' | 'memory' | 'json_file' | 'postgres' | string;
    configured?: boolean;
    dsn_configured?: boolean;
    table?: string | null;
    path?: string | null;
    memory_results?: number;
    persisted_results?: number;
    durable?: boolean;
    external_db?: boolean;
    error?: string | null;
}

export interface ForensicExecutionHarnessPhase {
    stage?: string;
    model?: string;
}

export interface ForensicExecutionHarness {
    taxonomy?: 'execution_harness_v1' | string;
    status?: 'active' | string;
    current_stage?: string;
    current_stage_model?: string;
    current_goal?: string;
    phases?: ForensicExecutionHarnessPhase[];
}

export interface ForensicStatusResponse {
    enabled: boolean;
    provider: 'configured' | 'fallback' | 'missing';
    reachable?: boolean;
    httpStatus?: number;
    mode?: string | null;
    ocr?: ForensicOcrRuntimeState | null;
    vehicleReference?: ForensicVehicleReferenceStatus | null;
    vehicleVmmrReadiness?: ForensicVehicleVmmrReadinessStatus | null;
    vehicleReidReadiness?: ForensicVehicleReidReadinessStatus | null;
    vehicleReidRuntime?: ForensicVehicleReidRuntimeStatus | null;
    vehicleReidRuntimeBacktest?: ForensicVehicleReidRuntimeBacktestStatus | null;
    trackingStore?: ForensicTrackingStoreStatus | null;
    executionHarness?: ForensicExecutionHarness | null;
    message: string;
}
