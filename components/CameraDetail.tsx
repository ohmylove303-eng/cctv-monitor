'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera } from '@/types';
import { getStatusColor, getStatusLabel, formatTimestamp } from '@/lib/utils';
import Hls from 'hls.js';
import { toPlayableStreamUrl } from '@/lib/stream';
import { toMilitaryGrid } from '@/lib/military-grid';
import { hasLiveTrafficStream, isMapOnlyTrafficCamera } from '@/lib/traffic-sources';
import { getCoordinateQualityLabel, hasApproximateCoordinate } from '@/lib/coordinate-quality';

interface Props {
    camera: Camera;
    recommendedLiveCameras?: Array<{
        id: string;
        name: string;
        region: Camera['region'];
        address: string;
        source?: string;
        distanceKm: number;
    }>;
    routeMonitoring?: {
        roadLabel: string;
        originLabel: string;
        destinationLabel: string | null;
        bundleCount: number;
        segmentCount: number;
        focusCount: number;
        highIdentificationCount: number;
        mediumIdentificationCount: number;
        directionLabel: string;
        directionSourceLabel: string;
        scopeLabel: string;
        immediateCount: number;
        shortCount: number;
        mediumCount: number;
        candidates: Array<{
            id: string;
            name: string;
            region: Camera['region'];
            address: string;
            distanceKm: number;
            routeDistanceKm: number;
            lateralOffsetMeters: number;
            travelOrder: number;
            isForward: boolean;
            identificationScore: number;
            identificationGrade: 'high' | 'medium' | 'low';
            identificationReason: string;
            etaMinutes: number;
            timeWindowLabel: string;
        }>;
    } | null;
    onSelectRecommended?: (id: string) => void;
    onClose: () => void;
    onAnalysis?: () => void;
}

type OfficialMetadataCandidate = {
    mngNo: string;
    manager: string;
    managerTel: string;
    purpose: string;
    roadAddress: string;
    jibunAddress: string;
    lat: number;
    lng: number;
    installedYm: string;
    dataDate: string;
    lastModified: string;
    cameraCount: string;
    score: number;
    currentDistanceMeters: number | null;
};

type OfficialMetadataResponse = {
    supported: boolean;
    source?: string;
    matched?: boolean;
    bestMatch?: OfficialMetadataCandidate | null;
    candidates?: OfficialMetadataCandidate[];
    error?: string;
};

export default function CameraDetail({
    camera,
    recommendedLiveCameras = [],
    routeMonitoring = null,
    onSelectRecommended,
    onClose,
    onAnalysis,
}: Props) {
    const color = getStatusColor(camera.status);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [hlsError, setHlsError] = useState(false);
    const [officialMetadata, setOfficialMetadata] = useState<OfficialMetadataResponse | null>(null);
    const [officialMetadataLoading, setOfficialMetadataLoading] = useState(false);
    const regionLabel = `${camera.region}시`;
    const militaryGrid = toMilitaryGrid(camera.position.lat, camera.position.lng);
    const wgs84Position = `${camera.position.lat.toFixed(6)}, ${camera.position.lng.toFixed(6)}`;
    const isLocalTraffic = isMapOnlyTrafficCamera({
        type: 'traffic',
        source: camera.source,
    });
    const isApproximateCoordinate = hasApproximateCoordinate({
        source: camera.source,
        coordinateSource: camera.coordinateSource,
        coordinateVerified: camera.coordinateVerified,
    });
    const coordinateQualityLabel = getCoordinateQualityLabel({
        source: camera.source,
        coordinateSource: camera.coordinateSource,
        coordinateVerified: camera.coordinateVerified,
    });
    const coordinateMasterLabel =
        camera.coordinateSource === 'official'
            ? '행안부/기관 공식 원본 우선'
            : camera.coordinateSource === 'its_api'
                ? '실시간 ITS 검증 좌표'
                : '운영 검증 좌표';
    const isItsLive = hasLiveTrafficStream({
        type: 'traffic',
        source: camera.source,
        streamUrl: camera.streamUrl ?? '',
        hlsUrl: camera.streamUrl ?? '',
    });
    const streamSourceLabel =
        isItsLive
            ? 'ITS 실시간'
            : isLocalTraffic
                ? '로컬 좌표 전용'
                : camera.source ?? '미상';

    // [CRITICAL FIX] 영상 주소 판별 로직 고도화
    const rawStreamUrl = camera.streamUrl;
    const streamUrl = toPlayableStreamUrl(rawStreamUrl);
    const isYouTube = rawStreamUrl?.includes('youtube.com') || rawStreamUrl?.includes('youtu.be');

    // [ULTRA-BYPASS] 사용자의 '환각 방지' 요구에 따라 판별 로직을 절대적으로 단순화함
    const isMockOrEmpty = !rawStreamUrl || rawStreamUrl === '#mock-stream';
    const emptyStateMessage = isLocalTraffic
        ? '이 카메라는 지도 표시용 로컬 교통 CCTV입니다. 기본 화면에서는 숨기고, 필요 시 별도 토글로만 표시합니다.'
        : '실시간 영상이 제공되지 않는 권역입니다';

    useEffect(() => {
        const supportedRegion = camera.region === '김포' || camera.region === '인천';
        const cameraType = camera.cameraType ?? (camera.name.includes('소방') ? 'fire' : camera.name.includes('교통') ? 'traffic' : 'crime');

        if (!supportedRegion || cameraType === 'traffic') {
            setOfficialMetadata(null);
            setOfficialMetadataLoading(false);
            return;
        }

        const controller = new AbortController();
        const params = new URLSearchParams({
            id: camera.id,
            name: camera.name,
            address: camera.location,
            region: camera.region,
            cameraType,
            lat: String(camera.position.lat),
            lng: String(camera.position.lng),
        });

        setOfficialMetadataLoading(true);
        fetch(`/api/cctv/official-metadata?${params.toString()}`, {
            signal: controller.signal,
            cache: 'no-store',
        })
            .then(async (response) => {
                const payload = await response.json();
                if (!response.ok) {
                    throw new Error(payload?.error || '행안부 메타데이터 조회 실패');
                }
                return payload as OfficialMetadataResponse;
            })
            .then((payload) => {
                if (!controller.signal.aborted) {
                    setOfficialMetadata(payload);
                }
            })
            .catch((error) => {
                if (!controller.signal.aborted) {
                    setOfficialMetadata({
                        supported: false,
                        error: error instanceof Error ? error.message : '행안부 메타데이터 조회 실패',
                    });
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setOfficialMetadataLoading(false);
                }
            });

        return () => controller.abort();
    }, [camera.cameraType, camera.id, camera.location, camera.name, camera.position.lat, camera.position.lng, camera.region]);

    useEffect(() => {
        if (!streamUrl || !videoRef.current || isYouTube) return;

        let hls: Hls | null = null;
        setHlsError(false);

        if (Hls.isSupported()) {
            hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
            });
            hls.loadSource(streamUrl);
            hls.attachMedia(videoRef.current);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                videoRef.current?.play().catch(e => console.log('Autoplay prevented:', e));
            });
            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    console.error('HLS Error:', data);
                    setHlsError(true);
                    hls?.destroy();
                }
            });
        } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
            // Safari Native HLS support
            videoRef.current.src = streamUrl;
            videoRef.current.addEventListener('loadedmetadata', () => {
                videoRef.current?.play().catch(e => console.log('Autoplay prevented:', e));
            });
            videoRef.current.addEventListener('error', () => {
                setHlsError(true);
            });
        }

        return () => {
            if (hls) {
                hls.destroy();
            }
        };
    }, [streamUrl, isYouTube]);

    return (
        <div
            style={{
                position: 'absolute',
                bottom: 20,
                right: 20,
                width: 320,
                background: 'rgba(8,14,38,0.96)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                backdropFilter: 'blur(20px)',
                zIndex: 1000,
                overflow: 'hidden',
            }}
        >
            {/* Header */}
            <div
                style={{
                    padding: '14px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    background: `linear-gradient(135deg, ${getStatusColor(camera.status)}11 0%, transparent 100%)`,
                }}
            >
                <div>
                    <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#64748b' }}>
                        {camera.id}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginTop: 2 }}>
                        {camera.name}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span
                        style={{
                            fontSize: 11,
                            color: getStatusColor(camera.status),
                            fontWeight: 700,
                            background: `${getStatusColor(camera.status)}22`,
                            padding: '2px 8px',
                            borderRadius: 5,
                        }}
                    >
                        {getStatusLabel(camera.status)}
                    </span>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.07)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 5,
                            color: '#94a3b8',
                            cursor: 'pointer',
                            fontSize: 14,
                            width: 26,
                            height: 26,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* CCTV Live Feed */}
            <div
                style={{
                    background: '#0a0a0a',
                    height: 160,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    position: 'relative',
                    overflow: 'hidden',
                }}
            >
                {isMockOrEmpty ? (
                    <div style={{
                        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', color: '#64748b'
                    }}>
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ marginBottom: 8, opacity: 0.5 }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 1 0 002-2V8a2 1 0 00-2-2H5a2 1 0 00-2 2v8a2 1 0 002 2z" />
                        </svg>
                        <span style={{ fontSize: 13, maxWidth: 220, textAlign: 'center', lineHeight: 1.5 }}>
                            {emptyStateMessage}
                        </span>
                    </div>
                ) : isYouTube ? (
                    <iframe
                        src={rawStreamUrl}
                        style={{ width: '100%', height: '100%', border: 'none' }}
                        allow="autoplay; encrypted-media"
                        allowFullScreen
                    />
                ) : (
                    <video
                        ref={videoRef}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        autoPlay
                        muted
                        playsInline
                    />
                )}

                {!isMockOrEmpty && hlsError && (
                    <>
                        <div
                            style={{
                                position: 'absolute',
                                inset: 0,
                                backgroundImage:
                                    'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.01) 2px, rgba(255,255,255,0.01) 4px)',
                            }}
                        />
                        <span style={{ fontSize: 32, opacity: 0.3 }}>📹</span>
                        <span style={{ fontSize: 11, color: '#ef4444' }}>
                            라이브 스트림 연결 실패
                        </span>
                    </>
                )}

                {camera.status === 'offline' && (
                    <span
                        style={{
                            position: 'absolute',
                            fontSize: 11,
                            color: '#ef4444',
                            background: 'rgba(239,68,68,0.15)',
                            padding: '2px 10px',
                            borderRadius: 4,
                            zIndex: 10
                        }}
                    >
                        오프라인
                    </span>
                )}
                {(camera.status === 'recording' || (rawStreamUrl && !hlsError && !isMockOrEmpty)) && (
                    <span
                        style={{
                            position: 'absolute',
                            top: 10,
                            left: 10,
                            fontSize: 10,
                            color: '#ef4444',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            fontWeight: 700,
                            zIndex: 10,
                            background: 'rgba(0,0,0,0.5)',
                            padding: '2px 6px',
                            borderRadius: 4
                        }}
                    >
                        <span
                            style={{
                                width: 7,
                                height: 7,
                                borderRadius: '50%',
                                background: '#ef4444',
                                animation: 'pulse 1s infinite',
                            }}
                        />
                        LIVE
                    </span>
                )}
            </div>

            {/* Details */}
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                    { label: '지역', value: regionLabel },
                    { label: '영상소스', value: streamSourceLabel },
                    { label: '좌표 기준', value: coordinateMasterLabel },
                    { label: '좌표 신뢰도', value: coordinateQualityLabel },
                    { label: '위치', value: camera.location },
                    { label: '군사 좌표', value: militaryGrid ?? 'MGRS 변환 불가', mono: true },
                    { label: 'WGS84', value: wgs84Position, mono: true },
                    { label: '해상도', value: camera.resolution },
                    { label: '프레임레이트', value: `${camera.fps} fps` },
                    { label: '설치일', value: formatTimestamp(camera.installedAt + 'T00:00:00.000Z').slice(0, 10) },
                    { label: '최근 점검', value: formatTimestamp(camera.lastMaintenance + 'T00:00:00.000Z').slice(0, 10) },
                ].map((row) => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 11, color: '#64748b', flexShrink: 0 }}>{row.label}</span>
                        <span style={{
                            fontSize: 11,
                            color: '#cbd5e1',
                            textAlign: 'right',
                            fontFamily: row.mono ? 'monospace' : 'inherit',
                            letterSpacing: row.mono ? '0.02em' : 'normal',
                        }}>{row.value}</span>
                    </div>
                ))}
                {isApproximateCoordinate && (
                    <div
                        style={{
                            marginTop: 4,
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: '1px solid rgba(251,191,36,0.22)',
                            background: 'rgba(120,53,15,0.16)',
                            color: '#fcd34d',
                            fontSize: 10,
                            lineHeight: 1.5,
                        }}
                    >
                            {camera.coordinateNote || '현재 점은 실제 카메라 폴 좌표가 아니라 주소/시드 기반 근사 위치입니다. 위성 배경과 미세하게 어긋나 보일 수 있습니다.'}
                        </div>
                    )}
                {(camera.cameraType === 'crime' || camera.cameraType === 'fire' || (!camera.cameraType && !camera.name.includes('교통'))) && (
                    <div
                        style={{
                            marginTop: 8,
                            paddingTop: 10,
                            borderTop: '1px solid rgba(255,255,255,0.08)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                        }}
                    >
                        <div>
                            <div style={{ fontSize: 11, color: '#22d3ee', fontWeight: 700 }}>
                                행안부 공식 메타데이터
                            </div>
                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, lineHeight: 1.5 }}>
                                CCTV정보 조회서비스 기준 후보를 주소/목적 기준으로 대조합니다.
                            </div>
                        </div>
                        {officialMetadataLoading && (
                            <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}>
                                행안부 공식 메타데이터 조회 중...
                            </div>
                        )}
                        {!officialMetadataLoading && officialMetadata?.bestMatch && (
                            <div
                                style={{
                                    padding: '10px 12px',
                                    borderRadius: 8,
                                    background: 'rgba(34,211,238,0.08)',
                                    border: '1px solid rgba(34,211,238,0.24)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 6,
                                }}
                            >
                                {[
                                    { label: '관리번호', value: officialMetadata.bestMatch.mngNo, mono: true },
                                    { label: '관리기관', value: officialMetadata.bestMatch.manager },
                                    { label: '기관 연락처', value: officialMetadata.bestMatch.managerTel || '미제공' },
                                    { label: '설치목적', value: officialMetadata.bestMatch.purpose },
                                    { label: '공식 주소', value: officialMetadata.bestMatch.roadAddress || officialMetadata.bestMatch.jibunAddress },
                                    { label: '공식 좌표', value: `${officialMetadata.bestMatch.lat.toFixed(6)}, ${officialMetadata.bestMatch.lng.toFixed(6)}`, mono: true },
                                    { label: '현재 점과 거리', value: officialMetadata.bestMatch.currentDistanceMeters !== null ? `${officialMetadata.bestMatch.currentDistanceMeters}m` : '계산 불가' },
                                    { label: '자료기준일', value: officialMetadata.bestMatch.dataDate || '미제공' },
                                ].map((row) => (
                                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                        <span style={{ fontSize: 10, color: '#67e8f9', flexShrink: 0 }}>{row.label}</span>
                                        <span style={{
                                            fontSize: 10,
                                            color: '#e0f2fe',
                                            textAlign: 'right',
                                            fontFamily: row.mono ? 'monospace' : 'inherit',
                                        }}>{row.value}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {!officialMetadataLoading && !officialMetadata?.bestMatch && officialMetadata?.candidates && officialMetadata.candidates.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {officialMetadata.candidates.map((candidate) => (
                                    <div
                                        key={`${candidate.mngNo}-${candidate.score}`}
                                        style={{
                                            padding: '9px 11px',
                                            borderRadius: 8,
                                            background: 'rgba(15,23,42,0.55)',
                                            border: '1px solid rgba(148,163,184,0.18)',
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                            <span style={{ fontSize: 10, color: '#e2e8f0', fontWeight: 700 }}>
                                                {candidate.manager}
                                            </span>
                                            <span style={{ fontSize: 10, color: '#38bdf8', fontFamily: 'monospace' }}>
                                                score {candidate.score}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, lineHeight: 1.5 }}>
                                            {candidate.purpose} · {candidate.roadAddress || candidate.jibunAddress}
                                        </div>
                                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                                            관리번호 {candidate.mngNo} · 현재 점과 {candidate.currentDistanceMeters ?? '?'}m
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {!officialMetadataLoading && officialMetadata?.error && (
                            <div style={{ fontSize: 10, color: '#fca5a5', lineHeight: 1.5 }}>
                                {officialMetadata.error}
                            </div>
                        )}
                        {!officialMetadataLoading && officialMetadata && !officialMetadata.error && !officialMetadata.bestMatch && (!officialMetadata.candidates || officialMetadata.candidates.length === 0) && (
                            <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.5 }}>
                                행안부 공식 후보를 찾지 못했습니다. 현재 로컬 이름/주소와 공식 원본이 직접 매핑되지 않는 상태입니다.
                            </div>
                        )}
                    </div>
                )}
                {isLocalTraffic && recommendedLiveCameras.length > 0 && (
                    <div
                        style={{
                            marginTop: 8,
                            paddingTop: 10,
                            borderTop: '1px solid rgba(255,255,255,0.08)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                        }}
                    >
                        <div>
                            <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700 }}>
                                가까운 ITS LIVE 대체
                            </div>
                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, lineHeight: 1.5 }}>
                                실시간 영상이 있는 교통 CCTV로 바로 이동합니다.
                            </div>
                        </div>
                        {recommendedLiveCameras.map((candidate) => (
                            <button
                                key={candidate.id}
                                onClick={() => onSelectRecommended?.(candidate.id)}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    background: 'rgba(56,189,248,0.08)',
                                    border: '1px solid rgba(56,189,248,0.24)',
                                    borderRadius: 8,
                                    color: '#e2e8f0',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                    <span style={{ fontSize: 11, fontWeight: 700 }}>{candidate.name}</span>
                                    <span style={{ fontSize: 10, color: '#38bdf8', flexShrink: 0 }}>
                                        {candidate.distanceKm < 1
                                            ? `${Math.round(candidate.distanceKm * 1000)}m`
                                            : `${candidate.distanceKm.toFixed(1)}km`}
                                    </span>
                                </div>
                                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, lineHeight: 1.5 }}>
                                    {candidate.region} · {candidate.source ?? 'ITS LIVE'}
                                </div>
                                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, lineHeight: 1.5 }}>
                                    {candidate.address}
                                </div>
                            </button>
                        ))}
                    </div>
                )}
                {routeMonitoring && routeMonitoring.candidates.length > 0 && (
                    <div
                        style={{
                            marginTop: 8,
                            paddingTop: 10,
                            borderTop: '1px solid rgba(255,255,255,0.08)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                        }}
                    >
                        <div>
                            <div style={{ fontSize: 11, color: '#22d3ee', fontWeight: 700 }}>
                                도로축 집중 감시
                            </div>
                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, lineHeight: 1.5 }}>
                                {routeMonitoring.originLabel}{routeMonitoring.destinationLabel ? ` → ${routeMonitoring.destinationLabel}` : ''} / {routeMonitoring.roadLabel} 기준 {routeMonitoring.directionLabel} / {routeMonitoring.directionSourceLabel} / {routeMonitoring.scopeLabel}. 즉시 {routeMonitoring.immediateCount}대, 단기 {routeMonitoring.shortCount}대, 중기 {routeMonitoring.mediumCount}대를 먼저 보고, 구간 {routeMonitoring.segmentCount}대 중 우선 추적 {routeMonitoring.focusCount}대를 상단에 두며, 전체 도로축은 {routeMonitoring.bundleCount}대입니다.
                                번호판/색상 식별 우선 {routeMonitoring.highIdentificationCount}대, 차종/색상 확인 우선 {routeMonitoring.mediumIdentificationCount}대를 먼저 추천합니다.
                            </div>
                        </div>
                        {routeMonitoring.candidates.map((candidate) => (
                            <button
                                key={candidate.id}
                                onClick={() => onSelectRecommended?.(candidate.id)}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    background: candidate.isForward ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${candidate.isForward ? 'rgba(34,211,238,0.24)' : 'rgba(255,255,255,0.1)'}`,
                                    borderRadius: 8,
                                    color: '#e2e8f0',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                                        <span style={{ fontSize: 11, fontWeight: 700 }}>
                                            {candidate.travelOrder}. {candidate.name}
                                        </span>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                            <span style={{
                                                fontSize: 9,
                                                fontWeight: 700,
                                                color: candidate.identificationGrade === 'high' ? '#fbbf24' : candidate.identificationGrade === 'medium' ? '#93c5fd' : '#94a3b8',
                                                background: candidate.identificationGrade === 'high'
                                                    ? 'rgba(251,191,36,0.12)'
                                                    : candidate.identificationGrade === 'medium'
                                                        ? 'rgba(59,130,246,0.12)'
                                                        : 'rgba(148,163,184,0.12)',
                                                border: `1px solid ${candidate.identificationGrade === 'high'
                                                    ? 'rgba(251,191,36,0.35)'
                                                    : candidate.identificationGrade === 'medium'
                                                        ? 'rgba(59,130,246,0.35)'
                                                        : 'rgba(148,163,184,0.2)'}`,
                                                borderRadius: 999,
                                                padding: '2px 6px',
                                            }}>
                                                {candidate.identificationGrade === 'high'
                                                    ? '식별 우선'
                                                    : candidate.identificationGrade === 'medium'
                                                        ? '확인 우선'
                                                        : '흐름 감시'}
                                            </span>
                                            <span style={{ fontSize: 9, color: candidate.isForward ? '#22d3ee' : '#94a3b8' }}>
                                                {candidate.isForward ? '집중' : '보조'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, lineHeight: 1.5 }}>
                                    {candidate.region} · {candidate.timeWindowLabel} · 경로거리 {candidate.routeDistanceKm.toFixed(1)}km · ETA {candidate.etaMinutes}분 · 측면오차 {candidate.lateralOffsetMeters}m · 식별점수 {candidate.identificationScore}
                                </div>
                                <div style={{ fontSize: 10, color: candidate.identificationGrade === 'high' ? '#fde68a' : '#cbd5e1', marginTop: 3, lineHeight: 1.5 }}>
                                    {candidate.identificationReason}
                                </div>
                                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, lineHeight: 1.5 }}>
                                    {candidate.address}
                                </div>
                            </button>
                        ))}
                    </div>
                )}
                {onAnalysis && (
                    <>
                        <button
                            onClick={onAnalysis}
                            style={{
                                marginTop: 10,
                                width: '100%',
                                padding: '10px',
                                background: 'rgba(99,102,241,0.2)',
                                border: '1px solid rgba(99,102,241,0.4)',
                                borderRadius: 8,
                                color: '#818cf8',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                transition: 'all 0.2s'
                            }}
                        >
                            {routeMonitoring ? '🚗 노선 그룹 분석 / 포렌식 추적' : '🚗 ITS 차량 분석 / 포렌식 추적'}
                        </button>
                        {routeMonitoring && (
                            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6, lineHeight: 1.5 }}>
                                현재 선택한 도로축 기준으로 상위 CCTV 묶음을 먼저 훑고, 단일 카메라 확인은 모달 안에서 보조 경로로 사용합니다.
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
