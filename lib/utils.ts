import { Camera, CameraStatus, ForensicEvent, AlertSeverity, RegionStats, SystemStatus } from '@/types';

// ─── 카메라 유틸리티 ─────────────────────────────────────────────────────────
export function getStatusColor(status: CameraStatus): string {
    const map: Record<CameraStatus, string> = {
        normal: '#22c55e',
        alert: '#f59e0b',
        offline: '#6b7280',
        recording: '#3b82f6',
    };
    return map[status];
}

export function getStatusLabel(status: CameraStatus): string {
    const map: Record<CameraStatus, string> = {
        normal: '정상',
        alert: '경보',
        offline: '오프라인',
        recording: '녹화중',
    };
    return map[status];
}

export function getSeverityColor(severity: AlertSeverity): string {
    const map: Record<AlertSeverity, string> = {
        low: '#22c55e',
        medium: '#f59e0b',
        high: '#ef4444',
        critical: '#dc2626',
    };
    return map[severity];
}

export function getSeverityLabel(severity: AlertSeverity): string {
    const map: Record<AlertSeverity, string> = {
        low: '낮음',
        medium: '중간',
        high: '높음',
        critical: '위험',
    };
    return map[severity];
}

export function getEventTypeLabel(type: string): string {
    const map: Record<string, string> = {
        motion_detected: '움직임 감지',
        face_detected: '얼굴 감지',
        vehicle_detected: '차량 감지',
        crowd_density: '군중 밀집',
        abandoned_object: '방치물 감지',
        perimeter_breach: '구역 침범',
        fire_smoke: '화재/연기',
        loitering: '배회 감지',
    };
    return map[type] ?? type;
}

// ─── 통계 계산 ────────────────────────────────────────────────────────────────
export function computeRegionStats(cameras: Camera[], events: ForensicEvent[]): RegionStats[] {
    const regions = ['김포', '인천'] as const;
    return regions.map((region) => {
        const regionCams = cameras.filter((c) => c.region === region);
        const regionEvents = events.filter((e) => e.region === region);
        const today = new Date().toDateString();
        const todayEvents = regionEvents.filter((e) => new Date(e.timestamp).toDateString() === today);
        return {
            region,
            totalCameras: regionCams.length,
            onlineCameras: regionCams.filter((c) => c.status !== 'offline').length,
            offlineCameras: regionCams.filter((c) => c.status === 'offline').length,
            alertCameras: regionCams.filter((c) => c.status === 'alert').length,
            eventsToday: todayEvents.length,
            criticalEvents: todayEvents.filter((e) => e.severity === 'critical').length,
        };
    });
}

export function getSystemStatus(): SystemStatus {
    return {
        serverTime: new Date().toISOString(),
        storageUsed: 4.2,
        storageTotal: 8,
        networkBandwidth: 124.6,
        activeSessions: 3,
        mfsrEngineVersion: 'MFSR v2.4.1',
        lastSync: new Date(Date.now() - 30000).toISOString(),
    };
}

// ─── 시간 포맷 ────────────────────────────────────────────────────────────────
export function formatTimestamp(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
}

export function timeAgo(iso: string): string {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return `${diff}초 전`;
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    return `${Math.floor(diff / 86400)}일 전`;
}
