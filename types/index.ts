// ─── CCTV 카메라 타입 ───────────────────────────────────────────────────────
export type CameraStatus = 'normal' | 'alert' | 'offline' | 'recording';
export type Region = '김포' | '인천';
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ForensicEventType =
    | 'motion_detected'
    | 'face_detected'
    | 'vehicle_detected'
    | 'crowd_density'
    | 'abandoned_object'
    | 'perimeter_breach'
    | 'fire_smoke'
    | 'loitering';

export interface GeoPoint {
    lat: number;
    lng: number;
}

export interface Camera {
    id: string;
    name: string;
    region: Region;
    location: string;
    position: GeoPoint;
    status: CameraStatus;
    resolution: string;
    fps: number;
    installedAt: string;
    lastMaintenance: string;
    streamUrl?: string;
    thumbnailUrl?: string;
}

// ─── 포렌식 이벤트 (MFSR 기반, AI 전면 배제) ──────────────────────────────
export interface ForensicEvent {
    id: string;
    cameraId: string;
    cameraName: string;
    region: Region;
    type: ForensicEventType;
    severity: AlertSeverity;
    timestamp: string;
    description: string;
    confidence: number;        // 알고리즘 신뢰도 (0–100)
    ruleId: string;            // 발동한 MFSR 룰셋 ID
    metadata: Record<string, unknown>;
    acknowledged: boolean;
    acknowledgedBy?: string;
    acknowledgedAt?: string;
}

// ─── 통계 및 대시보드 ─────────────────────────────────────────────────────
export interface RegionStats {
    region: Region;
    totalCameras: number;
    onlineCameras: number;
    offlineCameras: number;
    alertCameras: number;
    eventsToday: number;
    criticalEvents: number;
}

export interface DashboardState {
    selectedCamera: Camera | null;
    selectedRegion: Region | 'all';
    activeView: 'map' | 'grid' | 'list';
    filterStatus: CameraStatus | 'all';
    filterSeverity: AlertSeverity | 'all';
    showEventPanel: boolean;
    showCameraDetail: boolean;
    isFullscreen: boolean;
}

export interface SystemStatus {
    serverTime: string;
    storageUsed: number;   // GB
    storageTotal: number;  // GB
    networkBandwidth: number; // Mbps
    activeSessions: number;
    mfsrEngineVersion: string;
    lastSync: string;
}
