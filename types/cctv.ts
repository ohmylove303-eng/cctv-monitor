// ─── CCTV 핵심 타입 ──────────────────────────────────────────────────────────
export type CctvType = 'crime' | 'fire' | 'traffic';
export type CctvStatus = '정상' | '점검중' | '고장';
export type CctvRegion = '김포' | '인천';

export interface CctvItem {
    id: string;
    name: string;
    type: CctvType;
    status: CctvStatus;
    region: CctvRegion;
    district: string;
    address: string;
    operator: string;
    streamUrl: string;   // YouTube embed URL (데모)
    hlsUrl?: string;     // 실제 HLS .m3u8 URL (김포 ITS 연동)
    resolution?: string;
    installedYear?: number;
    lat: number;
    lng: number;
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
    tsa_status: 'verified' | 'local_fallback';
    generative_ai_used: boolean;
    quality_report: ForensicQualityReport;
    events_detected: string[];
    confidence: number;
    verdict: string;
}
