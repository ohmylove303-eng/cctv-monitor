'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
    CctvItem,
    ForensicOcrRuntimeState,
    ForensicRouteContext,
    ForensicResult,
    ForensicTrackCamera,
    ForensicTrackingResult,
} from '@/types/cctv';
import {
    analyzeCctv,
    buildForensicTrackScope,
    supportsVehicleForensic,
    trackVehicle,
    waitForTrackingResult,
} from '@/lib/forensic';
import { assessTravelWindow } from '@/lib/route-monitoring';

interface Props {
    cctv: CctvItem;
    allCctv?: CctvItem[];
    trackScopeOverride?: ForensicTrackCamera[];
    routeFocusSummary?: {
        roadLabel: string;
        originLabel: string;
        destinationLabel: string | null;
        bundleCount: number;
        segmentCount: number;
        focusCount: number;
        highIdentificationCount: number;
        mediumIdentificationCount: number;
        directionLabel: string;
        speedKph: number;
        directionSourceLabel: string;
        immediateCount: number;
        shortCount: number;
        mediumCount: number;
        scopeLabel: string;
    } | null;
    routeContext?: ForensicRouteContext | null;
    backendEnabled?: boolean;
    backendProvider?: 'configured' | 'fallback' | 'missing';
    backendMessage?: string | null;
    backendOcr?: ForensicOcrRuntimeState | null;
    trackingActiveCctvId?: string | null;
    onLocate?: (cctvId: string) => void;
    onTrackingResultChange?: (result: ForensicTrackingResult | null) => void;
    onTrackingActiveCctvChange?: (cctvId: string | null) => void;
    onClose: () => void;
}

type Phase = 'idle' | 'analyzing' | 'analyzed' | 'tracking' | 'tracked' | 'error';

type BundleAnalysisHit = {
    cctv_id: string;
    cctv_name: string;
    region: CctvItem['region'];
    confidence: number;
    vehicle_count: number;
    plate_candidates: string[];
    target_plate?: string;
    target_color?: string;
    target_vehicle_type?: string;
    expected_eta_minutes?: number;
    time_window_label?: string;
    is_route_focus?: boolean;
    analysis_stage: 'scan' | 'verify';
    ocr_status: ForensicResult['ocr_status'];
    ocr_engine?: string | null;
    ocr_diagnostics?: ForensicResult['ocr_diagnostics'];
};

type BundleAnalysisSummary = {
    processed: number;
    total: number;
    scanProcessed: number;
    verifyProcessed: number;
    scopeLabel: string;
    hits: BundleAnalysisHit[];
    suggestedPlate?: string;
    suggestedColor?: string;
    suggestedVehicleType?: string;
};

type CameraQualityTelemetry = {
    attempts: number;
    scanAttempts: number;
    verifyAttempts: number;
    vehicleHits: number;
    plateHits: number;
    bestConfidence: number;
    lastConfidence: number;
    lastVehicleCount: number;
    lastStage: 'scan' | 'verify';
    updatedAt: string;
};

type AnalysisRecheckCandidate = {
    id: string;
    name: string;
    region: CctvItem['region'];
    address: string;
    expectedEtaMinutes?: number;
    timeWindowLabel?: string;
    travelOrder?: number;
    priorityLabel: string;
    priorityTone: 'blue' | 'amber' | 'slate';
    reason: string;
    detail: string;
};

const DETECTION_STEPS = [
    { label: 'ITS 실시간 HLS 스트림 프레임 확보 중…', pct: 15 },
    { label: 'YOLO 차량 객체 검출 수행 중…', pct: 40 },
    { label: '입력 차량번호·색상·차종 단서 정리 중…', pct: 65 },
    { label: '차량 색상/차종 피처 벡터 정리 중…', pct: 85 },
    { label: '포렌식 해시 체인과 결과 증적화 중…', pct: 99 },
];

const TRACK_STEPS = [
    { label: 'ITS 실시간 카메라 목록 수집 중…', pct: 18 },
    { label: 'YOLO 검출 결과와 차량 속성 비교 중…', pct: 42 },
    { label: '차량번호 입력값·색상·차종 유사도 스코어링 중…', pct: 68 },
    { label: '카메라 간 통과 순서와 시간축 정렬 중…', pct: 88 },
    { label: '추적 결과 확정 및 리포트 생성 중…', pct: 99 },
];

const BUNDLE_SCOPE_LIMITS: Record<'focus' | 'bundle' | 'network', number> = {
    focus: 6,
    bundle: 8,
    network: 10,
};

const VEHICLE_TYPES = ['미지정', '세단', 'SUV', '트럭', '버스', '오토바이', '밴', '택시'];
const VEHICLE_COLORS = ['미지정', '흰색', '검정', '은색', '회색', '파랑', '빨강', '노랑', '초록', '갈색'];
const CAMERA_QUALITY_STORAGE_KEY = 'cctv-monitor.identification-quality.v1';
const MAX_CAMERA_QUALITY_ITEMS = 700;

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getIdentificationRank(camera: Pick<ForensicTrackCamera, 'identificationGrade'>) {
    if (camera.identificationGrade === 'high') return 2;
    if (camera.identificationGrade === 'medium') return 1;
    return 0;
}

function normalizeCameraQualityTelemetry(value: unknown): CameraQualityTelemetry | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const entry = value as Record<string, unknown>;
    const attempts = Math.max(0, Number(entry.attempts ?? 0));
    if (!Number.isFinite(attempts) || attempts <= 0) {
        return null;
    }

    const lastStage = entry.lastStage === 'verify' ? 'verify' : 'scan';
    return {
        attempts,
        scanAttempts: Math.max(0, Number(entry.scanAttempts ?? 0)),
        verifyAttempts: Math.max(0, Number(entry.verifyAttempts ?? 0)),
        vehicleHits: Math.max(0, Number(entry.vehicleHits ?? 0)),
        plateHits: Math.max(0, Number(entry.plateHits ?? 0)),
        bestConfidence: Math.max(0, Math.min(100, Number(entry.bestConfidence ?? 0))),
        lastConfidence: Math.max(0, Math.min(100, Number(entry.lastConfidence ?? 0))),
        lastVehicleCount: Math.max(0, Number(entry.lastVehicleCount ?? 0)),
        lastStage,
        updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date().toISOString(),
    };
}

function loadCameraQualityTelemetry(): Record<string, CameraQualityTelemetry> {
    if (typeof window === 'undefined') {
        return {};
    }

    try {
        const raw = window.localStorage.getItem(CAMERA_QUALITY_STORAGE_KEY);
        if (!raw) {
            return {};
        }

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return {};
        }

        const entries = Object.entries(parsed as Record<string, unknown>)
            .map(([id, value]) => [id, normalizeCameraQualityTelemetry(value)] as const)
            .filter((entry): entry is readonly [string, CameraQualityTelemetry] => Boolean(entry[1]))
            .sort((left, right) => new Date(right[1].updatedAt).getTime() - new Date(left[1].updatedAt).getTime())
            .slice(0, MAX_CAMERA_QUALITY_ITEMS);

        return Object.fromEntries(entries);
    } catch {
        return {};
    }
}

function persistCameraQualityTelemetry(value: Record<string, CameraQualityTelemetry>) {
    if (typeof window === 'undefined') {
        return;
    }

    const limited = Object.fromEntries(
        Object.entries(value)
            .sort((left, right) => new Date(right[1].updatedAt).getTime() - new Date(left[1].updatedAt).getTime())
            .slice(0, MAX_CAMERA_QUALITY_ITEMS)
    );

    try {
        window.localStorage.setItem(CAMERA_QUALITY_STORAGE_KEY, JSON.stringify(limited));
    } catch {
        // 분석 흐름을 막지 않기 위해 저장 실패는 조용히 무시한다.
    }
}

function getCameraQualityScore(entry?: CameraQualityTelemetry) {
    if (!entry || entry.attempts <= 0) {
        return 0;
    }

    const vehicleHitRate = Math.min(1, entry.vehicleHits / entry.attempts);
    const plateHitRate = Math.min(1, entry.plateHits / entry.attempts);
    const confidenceScore = Math.min(1, entry.bestConfidence / 100);
    const recencyDays = Math.max(0, (Date.now() - new Date(entry.updatedAt).getTime()) / 86400000);
    const recencyScore = recencyDays <= 1 ? 0.4 : recencyDays <= 7 ? 0.2 : 0;

    return (vehicleHitRate * 3) + (plateHitRate * 2) + confidenceScore + recencyScore;
}

function updateCameraQualityTelemetry(
    previous: Record<string, CameraQualityTelemetry>,
    cameraId: string,
    result: ForensicResult,
    stage: 'scan' | 'verify',
) {
    const current = previous[cameraId] ?? {
        attempts: 0,
        scanAttempts: 0,
        verifyAttempts: 0,
        vehicleHits: 0,
        plateHits: 0,
        bestConfidence: 0,
        lastConfidence: 0,
        lastVehicleCount: 0,
        lastStage: stage,
        updatedAt: new Date().toISOString(),
    };
    const vehicleCount = Math.max(0, result.vehicle_count ?? 0);
    const hasOcrPlate = result.ocr_status === 'ocr_active' && (result.plate_candidates?.length ?? 0) > 0;

    return {
        ...previous,
        [cameraId]: {
            attempts: current.attempts + 1,
            scanAttempts: current.scanAttempts + (stage === 'scan' ? 1 : 0),
            verifyAttempts: current.verifyAttempts + (stage === 'verify' ? 1 : 0),
            vehicleHits: current.vehicleHits + (vehicleCount > 0 ? 1 : 0),
            plateHits: current.plateHits + (hasOcrPlate ? 1 : 0),
            bestConfidence: Math.max(current.bestConfidence, result.confidence),
            lastConfidence: result.confidence,
            lastVehicleCount: vehicleCount,
            lastStage: stage,
            updatedAt: new Date().toISOString(),
        },
    };
}

function generateId(prefix: string) {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}`;
}

function getPlateSignalLabel(result: Pick<ForensicResult, 'ocr_status'>) {
    if (result.ocr_status === 'ocr_active') return '번호판 OCR 후보';
    if (result.ocr_status === 'target_hint_only') return '입력 차량번호 단서';
    if (result.ocr_status === 'skipped_no_vehicle') return '번호판 OCR';
    if (result.ocr_status === 'skipped_no_frames') return '번호판 OCR';
    if (result.ocr_status === 'ocr_unavailable') return '번호판 OCR';
    return '번호판 OCR';
}

function getPlateSignalValue(result: Pick<ForensicResult, 'ocr_status' | 'plate_candidates' | 'target_plate'>) {
    if (result.ocr_status === 'ocr_active') {
        return result.plate_candidates?.join(', ') || '없음';
    }
    if (result.ocr_status === 'target_hint_only') {
        return result.target_plate || '없음';
    }
    if (result.ocr_status === 'skipped_no_vehicle') {
        return '차량 검출이 없어 이번 프레임에서는 OCR을 건너뜀';
    }
    if (result.ocr_status === 'skipped_no_frames') {
        return '스트림 프레임 확보 실패';
    }
    if (result.ocr_status === 'ocr_unavailable') {
        return 'OCR 엔진 초기화 실패';
    }
    return 'OCR 결과 없음';
}

function getOcrActionGuidance(result: Pick<ForensicResult, 'ocr_status' | 'ocr_diagnostics' | 'plate_candidates'>) {
    const tier = getOcrConfidenceTier(result);
    const diagnostics = result.ocr_diagnostics;
    const hasCandidate = (result.plate_candidates?.length ?? 0) > 0;

    if (tier === 'strong') {
        return {
            label: '권고',
            value: '상위 후보가 반복 관측됐습니다. 동일 도로축 CCTV 추적으로 바로 넘겨도 됩니다.',
            tone: 'success' as const,
        };
    }

    if (tier === 'moderate') {
        return {
            label: '권고',
            value: '후보는 확보됐지만 지지가 약합니다. 인접 CCTV 1~2곳에서 재확인 후 추적을 이어가는 편이 안전합니다.',
            tone: 'info' as const,
        };
    }

    if (tier === 'weak') {
        return {
            label: '권고',
            value: hasCandidate
                ? '번호판 후보는 남았지만 판독 강도가 약합니다. 더 근거리 CCTV나 정면 각도의 프레임으로 한 번 더 확인하는 편이 안전합니다.'
                : 'OCR 관측은 있었지만 번호판 후보가 남지 않았습니다. 더 근거리 CCTV나 선명한 프레임으로 재시도하는 것이 좋습니다.',
            tone: 'warning' as const,
        };
    }

    if (tier === 'hint_only') {
        return {
            label: '권고',
            value: '현재 결과는 입력한 차량번호 단서에 의존합니다. 같은 도로축의 인접 CCTV에서 번호판 또는 색상 재확인을 권장합니다.',
            tone: 'info' as const,
        };
    }

    if (tier === 'skipped') {
        return {
            label: '권고',
            value: '이번 분석에서는 OCR을 생략했습니다. 차량이 더 크게 보이는 구간이나 다음 CCTV에서 다시 분석하는 편이 좋습니다.',
            tone: 'warning' as const,
        };
    }

    if (tier === 'unavailable') {
        return {
            label: '권고',
            value: 'OCR 런타임이 준비되지 않았습니다. 현재는 색상·차종·도로축 단서로 좁히고, OCR 복구 후 재확인하는 편이 안전합니다.',
            tone: 'warning' as const,
        };
    }

    if (!diagnostics && !hasCandidate) {
        return null;
    }

    return {
        label: '권고',
        value: '번호판 단서가 약합니다. 현재 결과는 참고용으로 보고 색상·차종·도로축 중심으로 먼저 좁히는 편이 좋습니다.',
        tone: 'warning' as const,
    };
}

function getOcrConfidenceTier(
    result: Pick<ForensicResult, 'ocr_status' | 'ocr_diagnostics' | 'plate_candidates'> | null | undefined
) {
    if (!result) {
        return 'not_available' as const;
    }

    if (result.ocr_status === 'target_hint_only') {
        return 'hint_only' as const;
    }

    if (result.ocr_status === 'skipped_no_vehicle' || result.ocr_status === 'skipped_no_frames') {
        return 'skipped' as const;
    }

    if (result.ocr_status === 'ocr_unavailable') {
        return 'unavailable' as const;
    }

    if (result.ocr_status !== 'ocr_active' || !result.ocr_diagnostics) {
        return 'not_available' as const;
    }

    const diagnostics = result.ocr_diagnostics;
    const candidateCount = result.plate_candidates?.length ?? 0;

    if (
        candidateCount > 0
        && diagnostics.top_candidate_support >= 2
        && diagnostics.top_candidate_weight >= 1.05
        && diagnostics.final_candidate_count <= 2
    ) {
        return 'strong' as const;
    }

    if (
        candidateCount > 0
        && diagnostics.top_candidate_support >= 1
        && diagnostics.top_candidate_weight >= 0.78
        && diagnostics.final_candidate_count <= 3
    ) {
        return 'moderate' as const;
    }

    if (candidateCount > 0 || diagnostics.observation_count > 0) {
        return 'weak' as const;
    }

    return 'not_available' as const;
}

function getOcrConfidenceTierMeta(
    tier:
        | 'strong'
        | 'moderate'
        | 'weak'
        | 'hint_only'
        | 'skipped'
        | 'unavailable'
        | 'not_available'
) {
    if (tier === 'strong') {
        return { label: '판독 강도 강함', tone: 'blue' as const };
    }
    if (tier === 'moderate') {
        return { label: '판독 강도 보통', tone: 'blue' as const };
    }
    if (tier === 'weak') {
        return { label: '판독 강도 약함', tone: 'amber' as const };
    }
    if (tier === 'hint_only') {
        return { label: '단서 기반', tone: 'amber' as const };
    }
    if (tier === 'skipped') {
        return { label: 'OCR 생략', tone: 'slate' as const };
    }
    if (tier === 'unavailable') {
        return { label: 'OCR 미가동', tone: 'amber' as const };
    }
    return null;
}

function buildAnalysisRecheckCandidates(
    currentCctvId: string,
    trackScope: ForensicTrackCamera[],
    routeContext: ForensicRouteContext | null | undefined,
    result: Pick<ForensicResult, 'ocr_status' | 'ocr_diagnostics' | 'plate_candidates'> | null | undefined,
) {
    const tier = getOcrConfidenceTier(result);
    if (tier === 'strong' || tier === 'not_available') {
        return [];
    }

    const priorityIds = routeContext
        ? [
            ...routeContext.immediateIds,
            ...routeContext.shortIds,
            ...routeContext.focusIds,
            ...routeContext.prioritizedIds,
        ].filter((id, index, array) => array.indexOf(id) === index)
        : trackScope.map((camera) => camera.id);
    const priorityOrder = new Map(priorityIds.map((id, index) => [id, index]));

    return trackScope
        .filter((camera) => camera.id !== currentCctvId)
        .sort((left, right) =>
            (priorityOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (priorityOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
            || Number(Boolean(right.isRouteFocus)) - Number(Boolean(left.isRouteFocus))
            || ((left.expectedEtaMinutes ?? Number.MAX_SAFE_INTEGER) - (right.expectedEtaMinutes ?? Number.MAX_SAFE_INTEGER))
            || ((left.travelOrder ?? Number.MAX_SAFE_INTEGER) - (right.travelOrder ?? Number.MAX_SAFE_INTEGER))
            || ((right.identificationScore ?? 0) - (left.identificationScore ?? 0))
        )
        .slice(0, tier === 'weak' ? 3 : 2)
        .map((camera) => {
            let reason = '후속 재확인';
            let priorityLabel = '후속';
            let priorityTone: AnalysisRecheckCandidate['priorityTone'] = 'slate';
            if (routeContext?.immediateIds.includes(camera.id)) {
                reason = '즉시 재확인';
                priorityLabel = '즉시';
                priorityTone = 'blue';
            } else if (routeContext?.shortIds.includes(camera.id)) {
                reason = '단기 재확인';
                priorityLabel = '단기';
                priorityTone = 'blue';
            } else if (camera.isRouteFocus) {
                reason = '집중군 재확인';
                priorityLabel = '집중군';
                priorityTone = 'blue';
            } else if (camera.identificationGrade === 'high') {
                reason = '식별 우선 지점';
                priorityLabel = '식별 우선';
                priorityTone = 'amber';
            } else if ((camera.expectedEtaMinutes ?? Number.MAX_SAFE_INTEGER) <= 5) {
                reason = '근접 구간 확인';
                priorityLabel = '근접';
                priorityTone = 'amber';
            }

            const detailParts = [
                camera.identificationReason,
                camera.timeWindowLabel ? `${camera.timeWindowLabel} 재확인 구간` : null,
                camera.expectedEtaMinutes !== undefined ? `예상 ${camera.expectedEtaMinutes}분 내 통과` : null,
            ].filter((part): part is string => Boolean(part));

            return {
                id: camera.id,
                name: camera.name,
                region: camera.region,
                address: camera.address,
                expectedEtaMinutes: camera.expectedEtaMinutes,
                timeWindowLabel: camera.timeWindowLabel,
                travelOrder: camera.travelOrder,
                priorityLabel,
                priorityTone,
                reason,
                detail: detailParts.join(' · '),
            };
        });
}

function buildOcrEvidenceSummary(
    result: Pick<ForensicResult, 'ocr_status' | 'ocr_engine' | 'plate_candidates' | 'ocr_diagnostics'> | null | undefined
) {
    if (!result) {
        return null;
    }

    return {
        status: result.ocr_status,
        engine: result.ocr_engine ?? null,
        top_candidate: result.plate_candidates?.[0] ?? null,
        candidate_count: result.plate_candidates?.length ?? 0,
        confidence_tier: getOcrConfidenceTier(result),
        diagnostics: result.ocr_diagnostics
            ? {
                frame_batches: result.ocr_diagnostics.frame_batches,
                observation_count: result.ocr_diagnostics.observation_count,
                raw_candidate_count: result.ocr_diagnostics.raw_candidate_count,
                viable_candidate_count: result.ocr_diagnostics.viable_candidate_count,
                final_candidate_count: result.ocr_diagnostics.final_candidate_count,
                suppressed_region_variants: result.ocr_diagnostics.suppressed_region_variants,
                top_candidate_support: result.ocr_diagnostics.top_candidate_support,
                top_candidate_weight: result.ocr_diagnostics.top_candidate_weight,
                top_candidate_reason: result.ocr_diagnostics.top_candidate_reason ?? null,
            }
            : null,
    };
}

function buildOcrSummaryChips(
    result: Pick<ForensicResult, 'ocr_status' | 'ocr_engine' | 'plate_candidates' | 'ocr_diagnostics'> | null | undefined
) {
    const summary = buildOcrEvidenceSummary(result);
    if (!summary) {
        return [];
    }

    const chips: Array<{
        key: string;
        label: string;
        tone: 'blue' | 'amber' | 'slate';
    }> = [];

    const confidenceTierMeta = getOcrConfidenceTierMeta(summary.confidence_tier);
    if (confidenceTierMeta) {
        chips.push({
            key: 'confidenceTier',
            label: confidenceTierMeta.label,
            tone: confidenceTierMeta.tone,
        });
    }

    if (summary.status === 'ocr_active' && summary.diagnostics) {
        chips.push({
            key: 'candidateCount',
            label: `OCR 후보 ${summary.diagnostics.final_candidate_count}개`,
            tone: 'blue',
        });

        if (summary.diagnostics.top_candidate_support > 0) {
            chips.push({
                key: 'support',
                label: `지지 ${summary.diagnostics.top_candidate_support}프레임`,
                tone: 'blue',
            });
        }
    }

    if (summary.engine) {
        chips.push({
            key: 'engine',
            label: summary.engine,
            tone: 'slate',
        });
    }

    return chips;
}

function buildBundleOcrOverview(summary: BundleAnalysisSummary | null | undefined) {
    if (!summary) {
        return null;
    }

    const ocrActiveHits = summary.hits.filter((hit) => hit.ocr_status === 'ocr_active');
    const hitsWithCandidates = summary.hits.filter((hit) => hit.plate_candidates.length > 0);
    const hintOnlyHits = summary.hits.filter((hit) => hit.ocr_status === 'target_hint_only');
    const skippedHits = summary.hits.filter(
        (hit) => hit.ocr_status === 'skipped_no_vehicle' || hit.ocr_status === 'skipped_no_frames'
    );
    const totalFinalCandidates = ocrActiveHits.reduce(
        (sum, hit) => sum + (hit.ocr_diagnostics?.final_candidate_count ?? hit.plate_candidates.length),
        0
    );
    const strongestSupport = ocrActiveHits.reduce(
        (max, hit) => Math.max(max, hit.ocr_diagnostics?.top_candidate_support ?? 0),
        0
    );
    const strongHits = ocrActiveHits.filter((hit) => getOcrConfidenceTier(hit) === 'strong').length;
    const moderateHits = ocrActiveHits.filter((hit) => getOcrConfidenceTier(hit) === 'moderate').length;
    const weakHits = ocrActiveHits.filter((hit) => getOcrConfidenceTier(hit) === 'weak').length;
    const representativeReason = [...ocrActiveHits]
        .sort((left, right) =>
            (right.ocr_diagnostics?.top_candidate_support ?? 0) - (left.ocr_diagnostics?.top_candidate_support ?? 0)
            || (right.confidence - left.confidence)
        )
        .find((hit) => Boolean(hit.ocr_diagnostics?.top_candidate_reason))
        ?.ocr_diagnostics?.top_candidate_reason ?? null;

    if (
        hitsWithCandidates.length === 0
        && hintOnlyHits.length === 0
        && skippedHits.length === 0
        && totalFinalCandidates === 0
    ) {
        return null;
    }

    return {
        hitsWithCandidates: hitsWithCandidates.length,
        hintOnlyHits: hintOnlyHits.length,
        skippedHits: skippedHits.length,
        totalFinalCandidates,
        strongestSupport,
        strongHits,
        moderateHits,
        weakHits,
        representativeReason,
    };
}

function buildTrackingOcrOverview(summary: ForensicTrackingResult | null | undefined) {
    if (!summary) {
        return null;
    }

    const ocrActiveHits = summary.hits.filter((hit) => hit.ocr_status === 'ocr_active');
    const hitsWithCandidates = summary.hits.filter((hit) => (hit.plate_candidates?.length ?? 0) > 0);
    const hintOnlyHits = summary.hits.filter((hit) => hit.ocr_status === 'target_hint_only');
    const skippedHits = summary.hits.filter(
        (hit) => hit.ocr_status === 'skipped_no_vehicle' || hit.ocr_status === 'skipped_no_frames'
    );
    const totalFinalCandidates = ocrActiveHits.reduce(
        (sum, hit) => sum + (hit.ocr_diagnostics?.final_candidate_count ?? hit.plate_candidates?.length ?? 0),
        0
    );
    const strongestSupport = ocrActiveHits.reduce(
        (max, hit) => Math.max(max, hit.ocr_diagnostics?.top_candidate_support ?? 0),
        0
    );
    const strongHits = ocrActiveHits.filter((hit) => getOcrConfidenceTier(hit) === 'strong').length;
    const moderateHits = ocrActiveHits.filter((hit) => getOcrConfidenceTier(hit) === 'moderate').length;
    const weakHits = ocrActiveHits.filter((hit) => getOcrConfidenceTier(hit) === 'weak').length;
    const representativeReason = [...ocrActiveHits]
        .sort((left, right) =>
            (right.ocr_diagnostics?.top_candidate_support ?? 0) - (left.ocr_diagnostics?.top_candidate_support ?? 0)
            || (right.confidence - left.confidence)
        )
        .find((hit) => Boolean(hit.ocr_diagnostics?.top_candidate_reason))
        ?.ocr_diagnostics?.top_candidate_reason ?? null;

    if (
        hitsWithCandidates.length === 0
        && hintOnlyHits.length === 0
        && skippedHits.length === 0
        && totalFinalCandidates === 0
    ) {
        return null;
    }

    return {
        hitsWithCandidates: hitsWithCandidates.length,
        hintOnlyHits: hintOnlyHits.length,
        skippedHits: skippedHits.length,
        totalFinalCandidates,
        strongestSupport,
        strongHits,
        moderateHits,
        weakHits,
        representativeReason,
    };
}

function buildTrackingHintChips(
    hit: Pick<ForensicTrackingResult['hits'][number], 'plate_candidates' | 'plate' | 'color' | 'vehicle_type'>,
    fallback: {
        suggestedTrackingPlate: string;
        effectiveTargetPlate: string;
        effectiveTargetColor: string;
        effectiveTargetVehicleType: string;
        resolvedPlateSourceLabel: string;
        resolvedColorSourceLabel: string;
        resolvedVehicleTypeSourceLabel: string;
    }
) {
    const chips: Array<{
        key: string;
        label: string;
        value: string;
        source: string;
        tone: 'blue' | 'emerald' | 'violet';
    }> = [];

    if (hit.plate_candidates && hit.plate_candidates.length > 0) {
        chips.push({
            key: 'plate',
            label: '번호판 후보',
            value: hit.plate_candidates[0],
            source: '이 카메라 OCR 후보',
            tone: 'blue',
        });
    } else if (hit.plate) {
        chips.push({
            key: 'plate',
            label: '번호판 단서',
            value: hit.plate,
            source: '추적 입력 유지',
            tone: 'blue',
        });
    } else if (fallback.effectiveTargetPlate) {
        chips.push({
            key: 'plate',
            label: '번호판 단서',
            value: fallback.effectiveTargetPlate,
            source: fallback.resolvedPlateSourceLabel || (fallback.suggestedTrackingPlate ? 'OCR/분석 자동 단서' : '추적 입력 유지'),
            tone: 'blue',
        });
    }

    if (hit.color) {
        chips.push({
            key: 'color',
            label: '색상',
            value: hit.color,
            source: '이 카메라 판정',
            tone: 'emerald',
        });
    } else if (fallback.effectiveTargetColor) {
        chips.push({
            key: 'color',
            label: '색상',
            value: fallback.effectiveTargetColor,
            source: fallback.resolvedColorSourceLabel || '추적 입력 유지',
            tone: 'emerald',
        });
    }

    if (hit.vehicle_type) {
        chips.push({
            key: 'vehicleType',
            label: '차종',
            value: hit.vehicle_type,
            source: '이 카메라 판정',
            tone: 'violet',
        });
    } else if (fallback.effectiveTargetVehicleType) {
        chips.push({
            key: 'vehicleType',
            label: '차종',
            value: fallback.effectiveTargetVehicleType,
            source: fallback.resolvedVehicleTypeSourceLabel || '추적 입력 유지',
            tone: 'violet',
        });
    }

    return chips;
}

function buildBundleHintChips(
    hit: BundleAnalysisHit,
    fallback: {
        requestedPlate: string;
        requestedColor: string;
        requestedVehicleType: string;
        suggestedPlate: string;
        suggestedColor: string;
        suggestedVehicleType: string;
    }
) {
    const chips: Array<{
        key: string;
        label: string;
        value: string;
        source: string;
        tone: 'blue' | 'emerald' | 'violet';
    }> = [];

    if (hit.plate_candidates.length > 0) {
        chips.push({
            key: 'plate',
            label: '번호판 후보',
            value: hit.plate_candidates[0],
            source: '이 카메라 OCR 후보',
            tone: 'blue',
        });
    } else if (hit.target_plate) {
        chips.push({
            key: 'plate',
            label: '번호판 단서',
            value: hit.target_plate,
            source: '이 카메라 입력 단서',
            tone: 'blue',
        });
    } else if (fallback.suggestedPlate) {
        chips.push({
            key: 'plate',
            label: '번호판 단서',
            value: fallback.suggestedPlate,
            source: '노선 상위 후보',
            tone: 'blue',
        });
    } else if (fallback.requestedPlate) {
        chips.push({
            key: 'plate',
            label: '번호판 단서',
            value: fallback.requestedPlate,
            source: '직접 입력',
            tone: 'blue',
        });
    }

    if (hit.target_color) {
        chips.push({
            key: 'color',
            label: '색상',
            value: hit.target_color,
            source: '이 카메라 판정',
            tone: 'emerald',
        });
    } else if (fallback.suggestedColor) {
        chips.push({
            key: 'color',
            label: '색상',
            value: fallback.suggestedColor,
            source: '노선 상위 후보',
            tone: 'emerald',
        });
    } else if (fallback.requestedColor) {
        chips.push({
            key: 'color',
            label: '색상',
            value: fallback.requestedColor,
            source: '직접 선택',
            tone: 'emerald',
        });
    }

    if (hit.target_vehicle_type) {
        chips.push({
            key: 'vehicleType',
            label: '차종',
            value: hit.target_vehicle_type,
            source: '이 카메라 판정',
            tone: 'violet',
        });
    } else if (fallback.suggestedVehicleType) {
        chips.push({
            key: 'vehicleType',
            label: '차종',
            value: fallback.suggestedVehicleType,
            source: '노선 상위 후보',
            tone: 'violet',
        });
    } else if (fallback.requestedVehicleType) {
        chips.push({
            key: 'vehicleType',
            label: '차종',
            value: fallback.requestedVehicleType,
            source: '직접 선택',
            tone: 'violet',
        });
    }

    return chips;
}

function normalizeAnalysisResult(raw: Record<string, unknown>, cctv: CctvItem): ForensicResult {
    const qualityReport = typeof raw.quality_report === 'object' && raw.quality_report
        ? raw.quality_report as Record<string, unknown>
        : {};

    return {
        job_id: String(raw.job_id ?? raw.jobId ?? generateId('analysis')),
        cctv_id: String(raw.cctv_id ?? raw.cctvId ?? cctv.id),
        timestamp: String(raw.timestamp ?? new Date().toISOString()),
        algorithm: String(raw.algorithm ?? 'YOLO vehicle detect / no-live-ocr'),
        input_hash: String(raw.input_hash ?? raw.inputHash ?? 'N/A'),
        result_hash: String(raw.result_hash ?? raw.resultHash ?? 'N/A'),
        chain_hash: String(raw.chain_hash ?? raw.chainHash ?? 'N/A'),
        prev_hash: String(raw.prev_hash ?? raw.prevHash ?? 'N/A'),
        tsa_status:
            raw.tsa_status === 'verified'
                ? 'verified'
                : raw.tsa_status === 'yolo_active'
                    ? 'yolo_active'
                    : 'demo_fallback',
        generative_ai_used: Boolean(raw.generative_ai_used),
        quality_report: {
            total_input: Number(qualityReport.total_input ?? qualityReport.totalInput ?? 0),
            passed: Number(qualityReport.passed ?? 0),
            dropped: Number(qualityReport.dropped ?? 0),
            threshold: Number(qualityReport.threshold ?? 0),
        },
        events_detected: Array.isArray(raw.events_detected)
            ? raw.events_detected.map(String)
            : Array.isArray(raw.events)
                ? raw.events.map(String)
                : ['vehicle_detected'],
        confidence: Number(raw.confidence ?? raw.score ?? 0),
        verdict: String(raw.verdict ?? raw.message ?? '차량 분석 완료'),
        vehicle_count: Number(raw.vehicle_count ?? raw.vehicleCount ?? 0),
        ocr_status:
            raw.ocr_status === 'ocr_active'
                ? 'ocr_active'
                : raw.ocr_status === 'target_hint_only'
                    ? 'target_hint_only'
                    : raw.ocr_status === 'ocr_unavailable'
                        ? 'ocr_unavailable'
                        : raw.ocr_status === 'skipped_no_vehicle'
                            ? 'skipped_no_vehicle'
                            : raw.ocr_status === 'skipped_no_frames'
                                ? 'skipped_no_frames'
                                : 'not_available',
        ocr_engine: typeof raw.ocr_engine === 'string' ? raw.ocr_engine : null,
        ocr_diagnostics:
            typeof raw.ocr_diagnostics === 'object' && raw.ocr_diagnostics
                ? {
                    frame_batches: Number((raw.ocr_diagnostics as Record<string, unknown>).frame_batches ?? 0),
                    observation_count: Number((raw.ocr_diagnostics as Record<string, unknown>).observation_count ?? 0),
                    raw_candidate_count: Number((raw.ocr_diagnostics as Record<string, unknown>).raw_candidate_count ?? 0),
                    viable_candidate_count: Number((raw.ocr_diagnostics as Record<string, unknown>).viable_candidate_count ?? 0),
                    final_candidate_count: Number((raw.ocr_diagnostics as Record<string, unknown>).final_candidate_count ?? 0),
                    suppressed_region_variants: Number((raw.ocr_diagnostics as Record<string, unknown>).suppressed_region_variants ?? 0),
                    top_candidate_support: Number((raw.ocr_diagnostics as Record<string, unknown>).top_candidate_support ?? 0),
                    top_candidate_weight: Number((raw.ocr_diagnostics as Record<string, unknown>).top_candidate_weight ?? 0),
                    top_candidate_reason: typeof (raw.ocr_diagnostics as Record<string, unknown>).top_candidate_reason === 'string'
                        ? String((raw.ocr_diagnostics as Record<string, unknown>).top_candidate_reason)
                        : null,
                }
                : null,
        target_plate: typeof raw.target_plate === 'string' ? raw.target_plate : undefined,
        target_color: typeof raw.target_color === 'string' ? raw.target_color : undefined,
        target_vehicle_type: typeof raw.target_vehicle_type === 'string' ? raw.target_vehicle_type : undefined,
        plate_candidates: Array.isArray(raw.plate_candidates) ? raw.plate_candidates.map(String) : [],
    };
}

function normalizeTrackingResult(
    raw: Record<string, unknown>,
    originCamera: CctvItem,
    scope: ForensicTrackCamera[],
    routeFocusSummary: Props['routeFocusSummary'],
): ForensicTrackingResult {
    const rawHits = Array.isArray(raw.hits)
        ? raw.hits
        : Array.isArray(raw.matches)
            ? raw.matches
            : Array.isArray(raw.results)
                ? raw.results
                : [];

    const originTime = typeof raw.origin_timestamp === 'string'
        ? new Date(raw.origin_timestamp).getTime()
        : null;

    const hits = rawHits.map((entry, index) => {
        const hit = (entry ?? {}) as Record<string, unknown>;
        const cctvId = String(hit.cctv_id ?? hit.camera_id ?? hit.cctvId ?? hit.cameraId ?? '');
        const cctvName = String(hit.cctv_name ?? hit.camera_name ?? hit.cctvName ?? hit.cameraName ?? '');
        const matchedCamera = scope.find((camera) => camera.id === cctvId || camera.name === cctvName);
        const plateCandidates = Array.isArray(hit.plate_candidates) ? hit.plate_candidates.map(String) : [];
        const expectedEtaMinutes = typeof hit.expected_eta_minutes === 'number'
            ? hit.expected_eta_minutes
            : typeof hit.expectedEtaMinutes === 'number'
                ? hit.expectedEtaMinutes
                : matchedCamera?.expectedEtaMinutes;
        const timeWindowLabel = typeof hit.time_window_label === 'string'
            ? hit.time_window_label
            : typeof hit.timeWindowLabel === 'string'
                ? hit.timeWindowLabel
                : matchedCamera?.timeWindowLabel;
        const observedMinutes =
            originTime && typeof hit.timestamp === 'string'
                ? Math.round((new Date(String(hit.timestamp)).getTime() - originTime) / 60000)
                : undefined;
        const assessedTravel = assessTravelWindow(expectedEtaMinutes, observedMinutes);
        const backendTravelCode = hit.travel_assessment === 'fast'
            || hit.travel_assessment === 'on_time'
            || hit.travel_assessment === 'delayed'
            || hit.travel_assessment === 'unknown'
            ? hit.travel_assessment as 'fast' | 'on_time' | 'delayed' | 'unknown'
            : null;
        const travelAssessment = observedMinutes === undefined && backendTravelCode
            ? {
                code: backendTravelCode,
                label: typeof hit.travel_assessment_label === 'string'
                    ? hit.travel_assessment_label
                    : assessedTravel.label,
            }
            : assessedTravel;
        const rawOcrDiagnostics = typeof hit.ocr_diagnostics === 'object' && hit.ocr_diagnostics
            ? hit.ocr_diagnostics as Record<string, unknown>
            : typeof hit.ocrDiagnostics === 'object' && hit.ocrDiagnostics
                ? hit.ocrDiagnostics as Record<string, unknown>
                : null;
        const ocrStatus: ForensicResult['ocr_status'] =
            hit.ocr_status === 'ocr_active'
            || hit.ocr_status === 'target_hint_only'
            || hit.ocr_status === 'ocr_unavailable'
            || hit.ocr_status === 'skipped_no_vehicle'
            || hit.ocr_status === 'skipped_no_frames'
            || hit.ocr_status === 'not_available'
                ? hit.ocr_status as ForensicResult['ocr_status']
                : plateCandidates.length > 0
                    ? 'ocr_active'
                    : typeof hit.plate === 'string'
                        ? 'target_hint_only'
                        : 'not_available';

        return {
            id: String(hit.id ?? `${cctvId || cctvName || 'hit'}-${index}`),
            cctv_id: matchedCamera?.id ?? cctvId,
            cctv_name: matchedCamera?.name ?? (cctvName || '알 수 없는 카메라'),
            region: matchedCamera?.region ?? '김포',
            address: matchedCamera?.address ?? String(hit.address ?? ''),
            timestamp: String(hit.timestamp ?? hit.detected_at ?? new Date().toISOString()),
            confidence: Number(hit.confidence ?? hit.score ?? 0),
            plate: typeof hit.plate === 'string' ? hit.plate : undefined,
            plate_candidates: plateCandidates,
            color: typeof hit.color === 'string' ? hit.color : undefined,
            vehicle_type: typeof hit.vehicle_type === 'string'
                ? hit.vehicle_type
                : typeof hit.vehicleType === 'string'
                    ? hit.vehicleType
                    : undefined,
            expected_eta_minutes: expectedEtaMinutes,
            time_window_label: timeWindowLabel,
            travel_assessment: travelAssessment.code,
            travel_assessment_label: travelAssessment.label,
            travel_order: typeof hit.travel_order === 'number'
                ? hit.travel_order
                : typeof hit.travelOrder === 'number'
                    ? hit.travelOrder
                    : matchedCamera?.travelOrder,
            is_route_focus: typeof hit.is_route_focus === 'boolean'
                ? hit.is_route_focus
                : typeof hit.isRouteFocus === 'boolean'
                    ? hit.isRouteFocus
                    : matchedCamera?.isRouteFocus,
            ocr_status: ocrStatus,
            ocr_engine: typeof hit.ocr_engine === 'string'
                ? hit.ocr_engine
                : typeof hit.ocrEngine === 'string'
                    ? hit.ocrEngine
                    : null,
            ocr_diagnostics: rawOcrDiagnostics
                ? {
                    frame_batches: Number(rawOcrDiagnostics.frame_batches ?? 0),
                    observation_count: Number(rawOcrDiagnostics.observation_count ?? 0),
                    raw_candidate_count: Number(rawOcrDiagnostics.raw_candidate_count ?? 0),
                    viable_candidate_count: Number(rawOcrDiagnostics.viable_candidate_count ?? 0),
                    final_candidate_count: Number(rawOcrDiagnostics.final_candidate_count ?? 0),
                    suppressed_region_variants: Number(rawOcrDiagnostics.suppressed_region_variants ?? 0),
                    top_candidate_support: Number(rawOcrDiagnostics.top_candidate_support ?? 0),
                    top_candidate_weight: Number(rawOcrDiagnostics.top_candidate_weight ?? 0),
                    top_candidate_reason: typeof rawOcrDiagnostics.top_candidate_reason === 'string'
                        ? String(rawOcrDiagnostics.top_candidate_reason)
                        : null,
                }
                : null,
        };
    });

    const rawStatus = String(raw.status ?? (hits.length ? 'completed' : 'processing'));
    const status: ForensicTrackingResult['status'] =
        rawStatus === 'queued' || rawStatus === 'processing' || rawStatus === 'completed' || rawStatus === 'error'
            ? rawStatus
            : hits.length
                ? 'completed'
                : 'processing';

    return {
        tracking_id: String(raw.tracking_id ?? raw.trackingId ?? raw.job_id ?? generateId('tracking')),
        status,
        searched_cameras: Number(raw.searched_cameras ?? raw.camera_count ?? scope.length),
        origin_cctv_id: typeof raw.origin_cctv_id === 'string'
            ? raw.origin_cctv_id
            : typeof raw.originCctvId === 'string'
                ? raw.originCctvId
                : originCamera.id,
        origin_cctv_name: typeof raw.origin_cctv_name === 'string'
            ? raw.origin_cctv_name
            : typeof raw.originCctvName === 'string'
                ? raw.originCctvName
                : originCamera.name,
        origin_timestamp: typeof raw.origin_timestamp === 'string'
            ? raw.origin_timestamp
            : typeof raw.originTimestamp === 'string'
                ? raw.originTimestamp
                : undefined,
        hits,
        message: typeof raw.message === 'string'
            ? raw.message
            : hits.length
                ? `${hits.length}건의 차량 이동 후보를 찾았습니다.${routeFocusSummary ? ` ${routeFocusSummary.roadLabel} 기준 집중 구간 우선 정렬이 적용되었습니다.` : ''}`
                : '일치하는 차량 이동 후보가 없습니다.',
    };
}

function buildBundleAnalysisSummary(
    rawResults: Array<ForensicResult & { cctvMeta: ForensicTrackCamera; analysisStage: 'scan' | 'verify' }>,
    routeFocusSummary: Props['routeFocusSummary'],
): BundleAnalysisSummary {
    const sorted = [...rawResults]
        .sort((left, right) =>
            (right.confidence - left.confidence)
            || ((left.cctvMeta.travelOrder ?? Number.MAX_SAFE_INTEGER) - (right.cctvMeta.travelOrder ?? Number.MAX_SAFE_INTEGER))
        );

    const suggestedPlate = sorted.find((item) => (item.plate_candidates?.length ?? 0) > 0)?.plate_candidates?.[0]
        || sorted.find((item) => item.target_plate)?.target_plate;
    const suggestedColor = sorted.find((item) => item.target_color)?.target_color ?? undefined;
    const suggestedVehicleType = sorted.find((item) => item.target_vehicle_type)?.target_vehicle_type ?? undefined;

    return {
        processed: rawResults.length,
        total: rawResults.length,
        scanProcessed: rawResults.filter((item) => item.analysisStage === 'scan').length,
        verifyProcessed: rawResults.filter((item) => item.analysisStage === 'verify').length,
        scopeLabel: routeFocusSummary?.scopeLabel ?? '우선 그룹',
        suggestedPlate: suggestedPlate || undefined,
        suggestedColor,
        suggestedVehicleType,
        hits: sorted.map((item) => ({
            cctv_id: item.cctv_id,
            cctv_name: item.cctvMeta.name,
            region: item.cctvMeta.region,
            confidence: item.confidence,
            vehicle_count: item.vehicle_count ?? 0,
            plate_candidates: item.plate_candidates ?? [],
            target_plate: item.target_plate,
            target_color: item.target_color,
            target_vehicle_type: item.target_vehicle_type,
            expected_eta_minutes: item.cctvMeta.expectedEtaMinutes,
            time_window_label: item.cctvMeta.timeWindowLabel,
            is_route_focus: item.cctvMeta.isRouteFocus,
            analysis_stage: item.analysisStage,
            ocr_status: item.ocr_status,
            ocr_engine: item.ocr_engine,
            ocr_diagnostics: item.ocr_diagnostics,
        })),
    };
}

function exportEvidence(payload: unknown, filename: string) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
    });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = filename;
    anchor.click();
}

export default function ForensicModal({
    cctv,
    allCctv = [],
    trackScopeOverride,
    routeFocusSummary = null,
    routeContext = null,
    backendEnabled = false,
    backendProvider = 'missing',
    backendMessage,
    backendOcr = null,
    trackingActiveCctvId = null,
    onLocate,
    onTrackingResultChange,
    onTrackingActiveCctvChange,
    onClose,
}: Props) {
    const [phase, setPhase] = useState<Phase>('idle');
    const [stepIdx, setStepIdx] = useState(0);
    const [progress, setProgress] = useState(0);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [analysisResult, setAnalysisResult] = useState<ForensicResult | null>(null);
    const [bundleAnalysisSummary, setBundleAnalysisSummary] = useState<BundleAnalysisSummary | null>(null);
    const [trackingResult, setTrackingResult] = useState<ForensicTrackingResult | null>(null);
    const [targetPlate, setTargetPlate] = useState('');
    const [targetColor, setTargetColor] = useState('미지정');
    const [targetVehicleType, setTargetVehicleType] = useState('미지정');
    const [carryoverNotice, setCarryoverNotice] = useState<string | null>(null);
    const [pendingAutoRecheckCctvId, setPendingAutoRecheckCctvId] = useState<string | null>(null);
    const [cameraQualityTelemetry, setCameraQualityTelemetry] = useState<Record<string, CameraQualityTelemetry>>(
        () => loadCameraQualityTelemetry()
    );
    const runIdRef = useRef(0);
    const targetPlateEditedRef = useRef(false);
    const autoFilledTargetPlateRef = useRef<string | null>(null);
    const startAnalysisRef = useRef<(() => Promise<void>) | null>(null);
    const trackingOriginCardRef = useRef<HTMLDivElement | null>(null);
    const trackingHitCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const previousCctvRef = useRef<{ id: string; name: string } | null>(null);

    useEffect(() => {
        onTrackingResultChange?.(trackingResult);
    }, [onTrackingResultChange, trackingResult]);

    useEffect(() => {
        if (!trackingResult) {
            onTrackingActiveCctvChange?.(null);
            return;
        }

        if (trackingActiveCctvId) {
            return;
        }

        onTrackingActiveCctvChange?.(
            trackingResult.hits[0]?.cctv_id
            ?? trackingResult.origin_cctv_id
            ?? null
        );
    }, [onTrackingActiveCctvChange, trackingActiveCctvId, trackingResult]);

    useEffect(() => {
        if (phase !== 'tracked' || !trackingResult || !trackingActiveCctvId) {
            return;
        }

        const targetElement = trackingResult.origin_cctv_id === trackingActiveCctvId
            ? trackingOriginCardRef.current
            : trackingHitCardRefs.current[trackingActiveCctvId] ?? null;

        if (!targetElement) {
            return;
        }

        targetElement.scrollIntoView({
            block: 'nearest',
            behavior: 'smooth',
        });
    }, [phase, trackingActiveCctvId, trackingResult]);

    const isCurrentCameraSupported = supportsVehicleForensic(cctv);
    const trackScope = useMemo(
        () => trackScopeOverride && trackScopeOverride.length > 0 ? trackScopeOverride : buildForensicTrackScope(allCctv),
        [allCctv, trackScopeOverride]
    );
    const bundleScope = useMemo(() => {
        const limit = routeContext
            ? BUNDLE_SCOPE_LIMITS[routeContext.scopeMode]
            : BUNDLE_SCOPE_LIMITS.focus;
        return [...trackScope]
            .sort((left, right) =>
                getIdentificationRank(right) - getIdentificationRank(left)
                || (getCameraQualityScore(cameraQualityTelemetry[right.id]) - getCameraQualityScore(cameraQualityTelemetry[left.id]))
                || (Number(right.isRouteFocus) - Number(left.isRouteFocus))
                || ((left.expectedEtaMinutes ?? Number.MAX_SAFE_INTEGER) - (right.expectedEtaMinutes ?? Number.MAX_SAFE_INTEGER))
                || ((left.travelOrder ?? Number.MAX_SAFE_INTEGER) - (right.travelOrder ?? Number.MAX_SAFE_INTEGER))
            )
            .slice(0, limit);
    }, [cameraQualityTelemetry, routeContext, trackScope]);
    const qualityBoostedCount = bundleScope.filter((camera) => getCameraQualityScore(cameraQualityTelemetry[camera.id]) > 0).length;
    const currentStreamUrl = cctv.hlsUrl || cctv.streamUrl || '';
    const ocrActionGuidance = analysisResult ? getOcrActionGuidance(analysisResult) : null;
    const analysisOcrSummary = buildOcrEvidenceSummary(analysisResult);
    const analysisOcrChips = buildOcrSummaryChips(analysisResult);
    const analysisRecheckCandidates = useMemo(
        () => buildAnalysisRecheckCandidates(cctv.id, trackScope, routeContext, analysisResult),
        [analysisResult, cctv.id, routeContext, trackScope]
    );
    const nextRecheckCandidate = analysisRecheckCandidates[0] ?? null;
    const rankedPlateCandidates = analysisResult?.ocr_status === 'ocr_active'
        ? analysisResult.plate_candidates ?? []
        : [];
    const suggestedTrackingPlate = rankedPlateCandidates[0]
        || analysisResult?.target_plate
        || bundleAnalysisSummary?.suggestedPlate
        || '';
    const suggestedTrackingPlateLabel = rankedPlateCandidates[0]
        ? 'OCR 1순위 후보'
        : analysisResult?.target_plate
            ? '분석 입력 단서'
            : bundleAnalysisSummary?.suggestedPlate
                ? '노선 상위 후보'
                : '';
    const effectiveTargetPlate = targetPlate.trim()
        || analysisResult?.target_plate
        || bundleAnalysisSummary?.suggestedPlate
        || '';
    const effectiveTargetColor = targetColor !== '미지정'
        ? targetColor
        : analysisResult?.target_color
            || bundleAnalysisSummary?.suggestedColor
            || '';
    const effectiveTargetVehicleType = targetVehicleType !== '미지정'
        ? targetVehicleType
        : analysisResult?.target_vehicle_type
            || bundleAnalysisSummary?.suggestedVehicleType
            || '';
    const hasTargetHints = Boolean(
        targetPlate.trim()
        || targetColor !== '미지정'
        || targetVehicleType !== '미지정'
    );
    const resolvedPlateSourceLabel = effectiveTargetPlate
        ? targetPlate.trim()
            ? (targetPlate.trim() === suggestedTrackingPlate && !targetPlateEditedRef.current
                ? `${suggestedTrackingPlateLabel} 자동 반영`
                : '직접 입력')
            : analysisResult?.target_plate
                ? '분석 입력 단서'
                : bundleAnalysisSummary?.suggestedPlate
                    ? '노선 상위 후보'
                    : '자동 단서'
        : '';
    const resolvedColorSourceLabel = effectiveTargetColor
        ? targetColor !== '미지정'
            ? '직접 선택'
            : analysisResult?.target_color
                ? '단일 분석 결과'
                : bundleAnalysisSummary?.suggestedColor
                    ? '노선 상위 후보'
                    : '자동 단서'
        : '';
    const resolvedVehicleTypeSourceLabel = effectiveTargetVehicleType
        ? targetVehicleType !== '미지정'
            ? '직접 선택'
            : analysisResult?.target_vehicle_type
                ? '단일 분석 결과'
                : bundleAnalysisSummary?.suggestedVehicleType
                    ? '노선 상위 후보'
                    : '자동 단서'
        : '';
    const trackingInputSummary = [
        effectiveTargetPlate
            ? {
                label: '차량번호',
                value: effectiveTargetPlate,
                source: resolvedPlateSourceLabel,
            }
            : null,
        effectiveTargetColor
            ? {
                label: '색상',
                value: effectiveTargetColor,
                source: resolvedColorSourceLabel,
            }
            : null,
        effectiveTargetVehicleType
            ? {
                label: '차종',
                value: effectiveTargetVehicleType,
                source: resolvedVehicleTypeSourceLabel,
            }
            : null,
    ].filter((item): item is { label: string; value: string; source: string } => Boolean(item));
    const bundleRequestedHints = [
        targetPlate.trim()
            ? { label: '차량번호', value: targetPlate.trim(), source: '직접 입력' }
            : null,
        targetColor !== '미지정'
            ? { label: '색상', value: targetColor, source: '직접 선택' }
            : null,
        targetVehicleType !== '미지정'
            ? { label: '차종', value: targetVehicleType, source: '직접 선택' }
            : null,
    ].filter((item): item is { label: string; value: string; source: string } => Boolean(item));
    const bundleSuggestedHints = [
        bundleAnalysisSummary?.suggestedPlate
            ? { label: '차량번호', value: bundleAnalysisSummary.suggestedPlate, source: '노선 상위 후보' }
            : null,
        bundleAnalysisSummary?.suggestedColor
            ? { label: '색상', value: bundleAnalysisSummary.suggestedColor, source: '노선 상위 후보' }
            : null,
        bundleAnalysisSummary?.suggestedVehicleType
            ? { label: '차종', value: bundleAnalysisSummary.suggestedVehicleType, source: '노선 상위 후보' }
            : null,
    ].filter((item): item is { label: string; value: string; source: string } => Boolean(item));
    const bundleOcrOverview = buildBundleOcrOverview(bundleAnalysisSummary);
    const trackingOcrOverview = buildTrackingOcrOverview(trackingResult);
    const bundleEvidencePayload = bundleAnalysisSummary
        ? {
            bundle_analysis: bundleAnalysisSummary,
            bundle_context: {
                requested_hints: bundleRequestedHints,
                suggested_hints: bundleSuggestedHints,
                route_focus_summary: routeFocusSummary,
                ocr_summary: buildOcrEvidenceSummary(analysisResult),
                hit_hint_sources: bundleAnalysisSummary.hits.map((hit) => ({
                    cctv_id: hit.cctv_id,
                    cctv_name: hit.cctv_name,
                    analysis_stage: hit.analysis_stage,
                    ocr_summary: buildOcrEvidenceSummary({
                        ocr_status: hit.ocr_status,
                        ocr_engine: hit.ocr_engine ?? null,
                        plate_candidates: hit.plate_candidates,
                        ocr_diagnostics: hit.ocr_diagnostics ?? null,
                    }),
                    hints: buildBundleHintChips(hit, {
                        requestedPlate: targetPlate.trim(),
                        requestedColor: targetColor !== '미지정' ? targetColor : '',
                        requestedVehicleType: targetVehicleType !== '미지정' ? targetVehicleType : '',
                        suggestedPlate: bundleAnalysisSummary.suggestedPlate || '',
                        suggestedColor: bundleAnalysisSummary.suggestedColor || '',
                        suggestedVehicleType: bundleAnalysisSummary.suggestedVehicleType || '',
                    }),
                })),
            },
        }
        : null;
    const analysisEvidencePayload = analysisResult
        ? {
            analysis: analysisResult,
            analysis_context: {
                ocr_summary: buildOcrEvidenceSummary(analysisResult),
                selected_hints: trackingInputSummary,
                route_focus_summary: routeFocusSummary,
                recheck_candidates: analysisRecheckCandidates,
            },
        }
        : null;
    const trackingEvidencePayload = trackingResult
        ? {
            analysis: analysisResult,
            tracking: trackingResult,
            tracking_context: {
                selected_hints: trackingInputSummary,
                route_focus_summary: routeFocusSummary,
                analysis_ocr_summary: buildOcrEvidenceSummary(analysisResult),
                hit_hint_sources: trackingResult.hits.map((hit) => ({
                    id: hit.id,
                    cctv_id: hit.cctv_id,
                    cctv_name: hit.cctv_name,
                    ocr_summary: buildOcrEvidenceSummary({
                        ocr_status: hit.ocr_status ?? 'not_available',
                        ocr_engine: hit.ocr_engine ?? null,
                        plate_candidates: hit.plate_candidates ?? [],
                        ocr_diagnostics: hit.ocr_diagnostics ?? null,
                    }),
                    hints: buildTrackingHintChips(hit, {
                        suggestedTrackingPlate,
                        effectiveTargetPlate,
                        effectiveTargetColor,
                        effectiveTargetVehicleType,
                        resolvedPlateSourceLabel,
                        resolvedColorSourceLabel,
                        resolvedVehicleTypeSourceLabel,
                    }),
                })),
            },
        }
        : null;

    useEffect(() => {
        const previous = previousCctvRef.current;
        if (!previous) {
            previousCctvRef.current = { id: cctv.id, name: cctv.name };
            return;
        }

        if (previous.id === cctv.id) {
            return;
        }

        const carryPlate = effectiveTargetPlate;
        const carryColor = effectiveTargetColor;
        const carryVehicleType = effectiveTargetVehicleType;

        runIdRef.current += 1;
        setPhase('idle');
        setStepIdx(0);
        setProgress(0);
        setErrorMessage(null);
        setAnalysisResult(null);
        setBundleAnalysisSummary(null);
        setTrackingResult(null);
        onTrackingActiveCctvChange?.(null);

        setTargetPlate(carryPlate || '');
        setTargetColor(carryColor || '미지정');
        setTargetVehicleType(carryVehicleType || '미지정');
        targetPlateEditedRef.current = Boolean(carryPlate);
        autoFilledTargetPlateRef.current = carryPlate || null;
        setCarryoverNotice(
            pendingAutoRecheckCctvId === cctv.id
                ? `${previous.name}에서 ${cctv.name}(으)로 재확인 이동했습니다. 기존 차량번호/색상/차종 단서를 유지한 채 1차 스캔을 바로 시작합니다.`
                : `${previous.name}에서 ${cctv.name}(으)로 재확인 이동했습니다. 기존 차량번호/색상/차종 단서를 유지했습니다.`
        );

        previousCctvRef.current = { id: cctv.id, name: cctv.name };
    }, [
        cctv.id,
        cctv.name,
        effectiveTargetColor,
        effectiveTargetPlate,
        effectiveTargetVehicleType,
        onTrackingActiveCctvChange,
        pendingAutoRecheckCctvId,
    ]);

    useEffect(() => {
        if (phase !== 'analyzed' || !suggestedTrackingPlate) {
            return;
        }

        const currentPlate = targetPlate.trim();
        const lastAutoFilledPlate = autoFilledTargetPlateRef.current;
        const canReplaceSuggestion = !targetPlateEditedRef.current
            || (lastAutoFilledPlate !== null && currentPlate === lastAutoFilledPlate);

        if (!canReplaceSuggestion) {
            return;
        }

        if (currentPlate === suggestedTrackingPlate) {
            autoFilledTargetPlateRef.current = suggestedTrackingPlate;
            return;
        }

        autoFilledTargetPlateRef.current = suggestedTrackingPlate;
        setTargetPlate(suggestedTrackingPlate);
    }, [phase, suggestedTrackingPlate, targetPlate]);

    const recordCameraQualityResult = (
        cameraId: string,
        result: ForensicResult,
        stage: 'scan' | 'verify',
    ) => {
        setCameraQualityTelemetry((previous) => {
            const next = updateCameraQualityTelemetry(previous, cameraId, result, stage);
            persistCameraQualityTelemetry(next);
            return next;
        });
    };

    const runStepSequence = async (steps: typeof DETECTION_STEPS, runId: number) => {
        for (let index = 0; index < steps.length; index += 1) {
            await sleep(600);
            if (runIdRef.current !== runId) {
                return;
            }
            setStepIdx(index);
            setProgress(steps[index].pct);
        }
    };

    const startAnalysis = async () => {
        setCarryoverNotice(null);
        setPendingAutoRecheckCctvId(null);
        setErrorMessage(null);
        setTrackingResult(null);
        setBundleAnalysisSummary(null);

        if (!backendEnabled) {
            setPhase('error');
            setErrorMessage(backendMessage || '차량 분석 서버가 아직 연결되지 않았습니다.');
            return;
        }

        if (!isCurrentCameraSupported) {
            setPhase('error');
            setErrorMessage('현재 카메라는 ITS 실시간 차량 분석 대상이 아닙니다. National-ITS 또는 실시간 ITS 소스만 분석할 수 있습니다.');
            return;
        }

        setPhase('analyzing');
        setStepIdx(0);
        setProgress(0);
        runIdRef.current += 1;
        const runId = runIdRef.current;

        try {
            const [_, rawScanResult] = await Promise.all([
                runStepSequence(DETECTION_STEPS, runId),
                analyzeCctv(
                    cctv.id,
                    currentStreamUrl,
                    undefined,
                    undefined,
                    undefined,
                    routeContext || undefined,
                    'scan',
                ),
            ]);

            const normalizedScanResult = normalizeAnalysisResult(rawScanResult, cctv);
            recordCameraQualityResult(cctv.id, normalizedScanResult, 'scan');
            setAnalysisResult(normalizedScanResult);
            setPhase('analyzed');
            setProgress(100);
        } catch (error) {
            console.error(error);
            setPhase('error');
            setErrorMessage(error instanceof Error ? error.message : '차량 분석 중 오류가 발생했습니다.');
        }
    };
    startAnalysisRef.current = startAnalysis;

    useEffect(() => {
        if (pendingAutoRecheckCctvId !== cctv.id || phase !== 'idle') {
            return;
        }

        const executeAutoRecheck = startAnalysisRef.current;
        if (!executeAutoRecheck) {
            return;
        }

        setPendingAutoRecheckCctvId(null);
        void executeAutoRecheck();
    }, [cctv.id, pendingAutoRecheckCctvId, phase]);

    const startVerifyAnalysis = async () => {
        setCarryoverNotice(null);
        setPendingAutoRecheckCctvId(null);
        setErrorMessage(null);

        if (!backendEnabled) {
            setPhase('error');
            setErrorMessage(backendMessage || '차량 분석 서버가 아직 연결되지 않았습니다.');
            return;
        }

        if (!isCurrentCameraSupported) {
            setPhase('error');
            setErrorMessage('현재 카메라는 ITS 실시간 차량 분석 대상이 아닙니다. National-ITS 또는 실시간 ITS 소스만 분석할 수 있습니다.');
            return;
        }

        setPhase('analyzing');
        setStepIdx(0);
        setProgress(0);
        runIdRef.current += 1;
        const runId = runIdRef.current;

        try {
            const [_, refinedRawResult] = await Promise.all([
                runStepSequence(DETECTION_STEPS, runId),
                analyzeCctv(
                    cctv.id,
                    currentStreamUrl,
                    targetPlate.trim() || undefined,
                    targetColor !== '미지정' ? targetColor : undefined,
                    targetVehicleType !== '미지정' ? targetVehicleType : undefined,
                    routeContext || undefined,
                    'verify',
                ),
            ]);

            const normalizedRefinedResult = normalizeAnalysisResult(refinedRawResult, cctv);
            recordCameraQualityResult(cctv.id, normalizedRefinedResult, 'verify');
            setAnalysisResult(normalizedRefinedResult);
            setPhase('analyzed');
            setProgress(100);
        } catch (error) {
            console.error(error);
            setPhase('error');
            setErrorMessage(error instanceof Error ? error.message : '2차 정밀 확인 중 오류가 발생했습니다.');
        }
    };

    const startBundleAnalysis = async () => {
        setCarryoverNotice(null);
        setPendingAutoRecheckCctvId(null);
        setErrorMessage(null);
        setAnalysisResult(null);
        setTrackingResult(null);
        setBundleAnalysisSummary(null);

        if (!backendEnabled) {
            setPhase('error');
            setErrorMessage(backendMessage || '차량 분석 서버가 아직 연결되지 않았습니다.');
            return;
        }

        if (bundleScope.length === 0) {
            setPhase('error');
            setErrorMessage('현재 도로축 범위에 순차 분석할 ITS 실시간 카메라가 없습니다.');
            return;
        }

        setPhase('analyzing');
        setStepIdx(0);
        setProgress(0);
        runIdRef.current += 1;
        const runId = runIdRef.current;

        try {
            const results: Array<ForensicResult & { cctvMeta: ForensicTrackCamera; analysisStage: 'scan' | 'verify' }> = [];

            for (let index = 0; index < bundleScope.length; index += 1) {
                if (runIdRef.current !== runId) {
                    return;
                }

                const camera = bundleScope[index];
                setStepIdx(Math.min(index, DETECTION_STEPS.length - 1));
                setProgress(Math.round(((index + 1) / bundleScope.length) * 100));

                const rawResult = await analyzeCctv(
                    camera.id,
                    camera.streamUrl,
                    undefined,
                    targetColor !== '미지정' ? targetColor : undefined,
                    targetVehicleType !== '미지정' ? targetVehicleType : undefined,
                    routeContext || undefined,
                    'scan',
                );

                const normalizedResult = normalizeAnalysisResult(rawResult, cctv);
                recordCameraQualityResult(camera.id, normalizedResult, 'scan');

                results.push({
                    ...normalizedResult,
                    cctv_id: camera.id,
                    cctvMeta: camera,
                    analysisStage: 'scan',
                });

                await sleep(180);
            }

            const verifyCandidates = [...results]
                .filter((item) => (item.vehicle_count ?? 0) > 0)
                .sort((left, right) =>
                    (getIdentificationRank(right.cctvMeta) - getIdentificationRank(left.cctvMeta))
                    || ((right.cctvMeta.isRouteFocus ? 1 : 0) - (left.cctvMeta.isRouteFocus ? 1 : 0))
                    || ((right.vehicle_count ?? 0) - (left.vehicle_count ?? 0))
                    || (right.confidence - left.confidence)
                )
                .slice(0, 2);

            for (const candidate of verifyCandidates) {
                if (runIdRef.current !== runId) {
                    return;
                }

                const refinedRawResult = await analyzeCctv(
                    candidate.cctvMeta.id,
                    candidate.cctvMeta.streamUrl,
                    targetPlate.trim() || undefined,
                    targetColor !== '미지정' ? targetColor : undefined,
                    targetVehicleType !== '미지정' ? targetVehicleType : undefined,
                    routeContext || undefined,
                    'verify',
                );

                const normalizedRefinedResult = normalizeAnalysisResult(refinedRawResult, cctv);
                recordCameraQualityResult(candidate.cctvMeta.id, normalizedRefinedResult, 'verify');

                const refined = {
                    ...normalizedRefinedResult,
                    cctv_id: candidate.cctvMeta.id,
                    cctvMeta: candidate.cctvMeta,
                    analysisStage: 'verify' as const,
                };

                const existingIndex = results.findIndex((item) => item.cctvMeta.id === candidate.cctvMeta.id);
                if (existingIndex >= 0) {
                    results[existingIndex] = refined;
                } else {
                    results.push(refined);
                }
            }

            if (runIdRef.current !== runId) {
                return;
            }

            setBundleAnalysisSummary(buildBundleAnalysisSummary(results, routeFocusSummary));
            setPhase('analyzed');
            setProgress(100);
        } catch (error) {
            console.error(error);
            setPhase('error');
            setErrorMessage(error instanceof Error ? error.message : '노선 그룹 순차 분석 중 오류가 발생했습니다.');
        }
    };

    const startTracking = async () => {
        setCarryoverNotice(null);
        setPendingAutoRecheckCctvId(null);
        setErrorMessage(null);

        if (!backendEnabled) {
            setPhase('error');
            setErrorMessage(backendMessage || '차량 추적 서버가 아직 연결되지 않았습니다.');
            return;
        }

        if (trackScope.length === 0) {
            setPhase('error');
            setErrorMessage('추적 가능한 ITS 실시간 카메라가 없습니다.');
            return;
        }

        if (!effectiveTargetPlate && !effectiveTargetColor && !effectiveTargetVehicleType) {
            setPhase('error');
            setErrorMessage('차량번호, 색상, 차종 중 하나 이상을 지정해야 추적할 수 있습니다.');
            return;
        }

        setPhase('tracking');
        setStepIdx(0);
        setProgress(0);
        runIdRef.current += 1;
        const runId = runIdRef.current;

        try {
            const [_, initialResult] = await Promise.all([
                runStepSequence(TRACK_STEPS, runId),
                trackVehicle({
                    plate: effectiveTargetPlate || undefined,
                    color: effectiveTargetColor || undefined,
                    vehicleType: effectiveTargetVehicleType || undefined,
                    originCctvId: cctv.id,
                    cctvList: trackScope,
                    routeContext: routeContext || undefined,
                }),
            ]);

            let normalized = normalizeTrackingResult(initialResult, cctv, trackScope, routeFocusSummary);

            if ((normalized.status === 'queued' || normalized.status === 'processing') && normalized.tracking_id) {
                const finalResult = await waitForTrackingResult(normalized.tracking_id);
                normalized = normalizeTrackingResult(finalResult, cctv, trackScope, routeFocusSummary);
            }

            setTrackingResult(normalized);
            setPhase('tracked');
            setProgress(100);
        } catch (error) {
            console.error(error);
            setPhase('error');
            setErrorMessage(error instanceof Error ? error.message : '차량 추적 중 오류가 발생했습니다.');
        }
    };

    const resetWorkflow = () => {
        runIdRef.current += 1;
        setPhase('idle');
        setStepIdx(0);
        setProgress(0);
        setErrorMessage(null);
        setAnalysisResult(null);
        setBundleAnalysisSummary(null);
        setTrackingResult(null);
        setCarryoverNotice(null);
        setPendingAutoRecheckCctvId(null);
    };

    const statusPill = isCurrentCameraSupported
        ? 'ITS 실시간 분석 가능'
        : '로컬/비실시간 소스';
    const backendPill = !backendEnabled
        ? '미설정'
        : backendProvider === 'fallback'
            ? '데모 fallback'
            : '실전 백엔드';
    const ocrRuntimeNote = !backendEnabled
        ? {
            color: '#fca5a5',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.22)',
            text: '번호판 OCR 상태를 확인하려면 먼저 분석 백엔드 연결이 필요합니다.',
        }
        : !backendOcr?.configured
            ? {
                color: '#fcd34d',
                background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.22)',
                text: '현재 번호판 OCR은 미설정 상태입니다. YOLO 차량 검출과 이동 추적은 가능하지만 번호판 확인은 제한됩니다.',
            }
            : backendOcr.error
                ? {
                    color: '#fca5a5',
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.22)',
                    text: `번호판 OCR 초기화에 실패했습니다. ${backendOcr.error}`,
                }
                : backendOcr.status === 'ready' || backendOcr.ready
                    ? {
                        color: '#bbf7d0',
                        background: 'rgba(16,185,129,0.08)',
                        border: '1px solid rgba(16,185,129,0.22)',
                        text: `번호판 OCR 준비 완료${backendOcr.engine ? ` (${backendOcr.engine})` : ''}. 2차 정밀 확인 또는 추적 시 OCR 후보를 함께 평가합니다.`,
                    }
                    : backendOcr.status === 'lazy_not_initialized'
                        ? {
                            color: '#bfdbfe',
                            background: 'rgba(59,130,246,0.08)',
                            border: '1px solid rgba(59,130,246,0.22)',
                            text: `번호판 OCR은 준비 대기 상태입니다${backendOcr.engine ? ` (${backendOcr.engine})` : ''}. 실패가 아니라 첫 정밀 OCR 요청이 들어오면 그때 로드됩니다.`,
                        }
                        : {
                            color: '#cbd5e1',
                            background: 'rgba(148,163,184,0.08)',
                            border: '1px solid rgba(148,163,184,0.22)',
                            text: `번호판 OCR 상태 확인 중${backendOcr?.engine ? ` (${backendOcr.engine})` : ''}. 현재 차량 검출 흐름은 정상입니다.`,
                        };

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.85)',
                backdropFilter: 'blur(12px)',
                zIndex: 11000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
            }}
        >
            <div
                onClick={(event) => event.stopPropagation()}
                className="glass-panel"
                style={{
                    borderRadius: 14,
                    width: '100%',
                    maxWidth: 640,
                    overflow: 'hidden',
                    border: '1px solid rgba(56,189,248,0.28)',
                    boxShadow: '0 0 50px rgba(56,189,248,0.18)',
                }}
            >
                <div
                    style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border-glass)',
                        background: 'rgba(13,25,48,0.9)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <div>
                        <div
                            style={{
                                fontSize: 9,
                                color: '#38bdf8',
                                fontWeight: 800,
                                letterSpacing: '0.12em',
                                textTransform: 'uppercase',
                                marginBottom: 3,
                            }}
                        >
                            ITS Vehicle Analysis / YOLO Track
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>
                            {cctv.id} · {cctv.name}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.07)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: '#64748b',
                            borderRadius: '50%',
                            width: 28,
                            height: 28,
                            cursor: 'pointer',
                            fontSize: 16,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        ✕
                    </button>
                </div>

                <div style={{ padding: 16, maxHeight: '72vh', overflowY: 'auto' }}>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                            gap: 8,
                            marginBottom: 14,
                        }}
                    >
                        {[
                            { label: '현재 카메라', value: statusPill, color: isCurrentCameraSupported ? '#22c55e' : '#f59e0b' },
                            {
                                label: '추적 범위',
                                value: routeFocusSummary
                                    ? `${routeFocusSummary.scopeLabel} / ${trackScope.length}대`
                                    : `${trackScope.length}대 ITS LIVE`,
                                color: '#38bdf8',
                            },
                            {
                                label: '백엔드',
                                value: backendPill,
                                color: !backendEnabled
                                    ? '#ef4444'
                                    : backendProvider === 'fallback'
                                        ? '#f59e0b'
                                        : '#22c55e',
                            },
                        ].map((item) => (
                            <div
                                key={item.label}
                                style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.07)',
                                    borderRadius: 8,
                                    padding: '9px 10px',
                                }}
                            >
                                <div style={{ fontSize: 9, color: '#475569', marginBottom: 4 }}>{item.label}</div>
                                <div style={{ fontSize: 12, fontWeight: 800, color: item.color }}>{item.value}</div>
                            </div>
                        ))}
                    </div>

                    <div
                        style={{
                            marginBottom: 12,
                            padding: '10px 12px',
                            background: 'rgba(56,189,248,0.08)',
                            border: '1px solid rgba(56,189,248,0.2)',
                            borderRadius: 8,
                            fontSize: 11,
                            color: '#bae6fd',
                            lineHeight: 1.7,
                        }}
                        >
                            ITS 실시간 카메라에서만 YOLO 차량 검출과 추적을 수행합니다.
                            로컬 교통 CCTV는 지도 기준점용이므로 분석 대상에서 제외됩니다.
                            단일 CCTV 빠른 확인은 항상 1차 스캔만 수행합니다. 번호판·색상·차종 단서로 더 좁혀야 할 때만 아래의 2차 정밀 확인을 별도로 실행합니다.
                    </div>

                    {backendEnabled && backendProvider === 'fallback' && (
                        <div
                            style={{
                                marginBottom: 12,
                                padding: '10px 12px',
                                background: 'rgba(245,158,11,0.08)',
                                border: '1px solid rgba(245,158,11,0.22)',
                                borderRadius: 8,
                                fontSize: 11,
                                color: '#fcd34d',
                                lineHeight: 1.7,
                            }}
                        >
                            현재는 외부 YOLO 서버 대신 내장 데모 fallback으로 운용 중입니다.
                            결과는 UI 흐름 검증용이며 실전 포렌식 판정으로 간주하면 안 됩니다.
                        </div>
                    )}

                    <div
                        style={{
                            marginBottom: 12,
                            padding: '10px 12px',
                            background: ocrRuntimeNote.background,
                            border: ocrRuntimeNote.border,
                            borderRadius: 8,
                            fontSize: 11,
                            color: ocrRuntimeNote.color,
                            lineHeight: 1.7,
                        }}
                    >
                        {ocrRuntimeNote.text}
                    </div>

                    {routeFocusSummary && (
                        <div
                            style={{
                                marginBottom: 12,
                                padding: '10px 12px',
                                background: 'rgba(34,211,238,0.08)',
                                border: '1px solid rgba(34,211,238,0.2)',
                                borderRadius: 8,
                                fontSize: 11,
                                color: '#cffafe',
                                lineHeight: 1.7,
                            }}
                        >
                            현재 추적은 {routeFocusSummary.originLabel}{routeFocusSummary.destinationLabel ? ` → ${routeFocusSummary.destinationLabel}` : ''} / {routeFocusSummary.roadLabel} 기준으로 동작합니다.
                            {routeFocusSummary.directionLabel} / {routeFocusSummary.directionSourceLabel} / {routeFocusSummary.speedKph}km/h / {routeFocusSummary.scopeLabel} 기준으로 구간 {routeFocusSummary.segmentCount}대 중 집중 감시 {routeFocusSummary.focusCount}대를 우선 배치하고, 같은 도로축 전체 {routeFocusSummary.bundleCount}대를 검색 순서에 반영합니다. 식별 우선 {routeFocusSummary.highIdentificationCount}대, 확인 우선 {routeFocusSummary.mediumIdentificationCount}대, 즉시 {routeFocusSummary.immediateCount}대, 단기 {routeFocusSummary.shortCount}대, 중기 {routeFocusSummary.mediumCount}대가 우선입니다.
                        </div>
                    )}

                    {routeContext && (
                        <div
                            style={{
                                marginBottom: 12,
                                padding: '10px 12px',
                                background: 'rgba(16,185,129,0.08)',
                                border: '1px solid rgba(16,185,129,0.22)',
                                borderRadius: 8,
                                fontSize: 11,
                                color: '#bbf7d0',
                                lineHeight: 1.7,
                            }}
                        >
                            노선 그룹 분석 세션이 활성화되었습니다.
                            {` ${routeContext.originLabel}${routeContext.destinationLabel ? ` → ${routeContext.destinationLabel}` : ''} / ${routeContext.roadLabel} / ${routeContext.scopeLabel} 기준으로`}
                            {` 즉시 ${routeContext.immediateIds.length}대 → 단기 ${routeContext.shortIds.length}대 → 중기 ${routeContext.mediumIds.length}대 → 후속 ${routeContext.followupIds.length}대 순으로`}
                            차량번호·색상·차종 단서를 더 강하게 적용합니다.
                        </div>
                    )}

                    {routeContext && (
                        <div
                            style={{
                                marginBottom: 12,
                                padding: '10px 12px',
                                background: 'rgba(99,102,241,0.08)',
                                border: '1px solid rgba(99,102,241,0.22)',
                                borderRadius: 8,
                                fontSize: 11,
                                color: '#ddd6fe',
                                lineHeight: 1.7,
                            }}
                        >
                            이번 순차 분석은 현재 범위에서 상위 {bundleScope.length}대만 실행합니다.
                            먼저 노선 그룹에서 차량번호·색상·차종 단서를 모으고, 그 결과를 같은 도로축 추적에 재사용합니다.
                            {qualityBoostedCount > 0 ? ` 최근 분석 성공 이력 ${qualityBoostedCount}대도 같은 등급 안에서 보조 순위로 반영됩니다.` : ''}
                        </div>
                    )}

                    {routeContext && (phase === 'idle' || phase === 'error') && (
                        <div
                            style={{
                                marginBottom: 12,
                                padding: '10px 12px',
                                background: 'rgba(245,158,11,0.08)',
                                border: '1px solid rgba(245,158,11,0.22)',
                                borderRadius: 8,
                                fontSize: 11,
                                color: '#fde68a',
                                lineHeight: 1.7,
                            }}
                        >
                            현재 운영 환경에서는 <strong style={{ color: '#fef3c7' }}>노선 그룹 순차 분석</strong>이 기본 실전 경로입니다.
                            단일 CCTV 분석은 빠른 보조 확인용으로 두고, 실제 추적은 같은 도로축 상위 CCTV 묶음을 먼저 훑는 흐름을 권장합니다.
                        </div>
                    )}

                    {carryoverNotice && (
                        <div
                            style={{
                                marginBottom: 12,
                                padding: '10px 12px',
                                background: 'rgba(59,130,246,0.08)',
                                border: '1px solid rgba(59,130,246,0.22)',
                                borderRadius: 8,
                                fontSize: 11,
                                color: '#bfdbfe',
                                lineHeight: 1.7,
                            }}
                        >
                            <div>{carryoverNotice}</div>
                            {phase === 'analyzed' && nextRecheckCandidate && onLocate && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 10, color: '#93c5fd' }}>
                                        다음 권장: {nextRecheckCandidate.name}
                                        {nextRecheckCandidate.timeWindowLabel ? ` · ${nextRecheckCandidate.timeWindowLabel}` : ''}
                                        {nextRecheckCandidate.expectedEtaMinutes !== undefined ? ` · ETA ${nextRecheckCandidate.expectedEtaMinutes}분` : ''}
                                    </span>
                                    <button
                                        onClick={() => {
                                            setPendingAutoRecheckCctvId(nextRecheckCandidate.id);
                                            onLocate(nextRecheckCandidate.id);
                                        }}
                                        style={{
                                            padding: '6px 10px',
                                            borderRadius: 6,
                                            border: '1px solid rgba(59,130,246,0.24)',
                                            background: 'rgba(59,130,246,0.10)',
                                            color: '#dbeafe',
                                            fontSize: 11,
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        다음 후보 계속
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {(phase === 'analyzed' || phase === 'tracked') && hasTargetHints && (
                        <div
                            style={{
                                marginBottom: 12,
                                padding: '10px 12px',
                                background: 'rgba(245,158,11,0.08)',
                                border: '1px solid rgba(245,158,11,0.22)',
                                borderRadius: 8,
                                fontSize: 11,
                                color: '#fde68a',
                                lineHeight: 1.7,
                            }}
                        >
                            <strong style={{ color: '#fef3c7' }}>2차 정밀 확인</strong>은 현재 보조 검증 경로입니다.
                            Render 환경 특성상 실전 YOLO 대신 데모 fallback으로 처리될 수 있으므로, 우선 판단은 1차 스캔 또는 노선 그룹 순차 분석 결과를 기준으로 보는 것을 권장합니다.
                        </div>
                    )}

                    {!backendEnabled && (
                        <div
                            style={{
                                marginBottom: 12,
                                padding: '10px 12px',
                                background: 'rgba(239,68,68,0.08)',
                                border: '1px solid rgba(239,68,68,0.22)',
                                borderRadius: 8,
                                fontSize: 11,
                                color: '#fca5a5',
                                lineHeight: 1.7,
                            }}
                        >
                            {backendMessage || 'FORENSIC_API_URL 환경변수가 없어 차량 분석 서버를 호출할 수 없습니다.'}
                        </div>
                    )}

                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '1.3fr 1fr 1fr',
                            gap: 8,
                            marginBottom: 14,
                        }}
                    >
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span style={{ fontSize: 10, color: '#64748b' }}>차량번호</span>
                            <input
                                value={targetPlate}
                                onChange={(event) => {
                                    targetPlateEditedRef.current = true;
                                    autoFilledTargetPlateRef.current = null;
                                    setTargetPlate(event.target.value);
                                }}
                                placeholder="예: 12가3456 또는 일부 번호"
                                style={{
                                    width: '100%',
                                    padding: '8px 10px',
                                    borderRadius: 6,
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.12)',
                                    color: '#e2e8f0',
                                    fontSize: 12,
                                }}
                            />
                            {suggestedTrackingPlate && (
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 8,
                                        marginTop: 6,
                                        fontSize: 10,
                                        color: '#93c5fd',
                                    }}
                                >
                                    <span>
                                        {suggestedTrackingPlateLabel} {targetPlate.trim() === suggestedTrackingPlate
                                            ? '자동 반영됨'
                                            : `추천: ${suggestedTrackingPlate}`}
                                    </span>
                                    {targetPlate.trim() !== suggestedTrackingPlate && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                targetPlateEditedRef.current = false;
                                                autoFilledTargetPlateRef.current = suggestedTrackingPlate;
                                                setTargetPlate(suggestedTrackingPlate);
                                            }}
                                            style={{
                                                border: '1px solid rgba(56,189,248,0.25)',
                                                background: 'rgba(56,189,248,0.08)',
                                                color: '#bae6fd',
                                                borderRadius: 999,
                                                padding: '4px 8px',
                                                fontSize: 10,
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            적용
                                        </button>
                                    )}
                                </div>
                            )}
                        </label>

                        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span style={{ fontSize: 10, color: '#64748b' }}>색상</span>
                            <select
                                value={targetColor}
                                onChange={(event) => setTargetColor(event.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '8px 10px',
                                    borderRadius: 6,
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.12)',
                                    color: '#e2e8f0',
                                    fontSize: 12,
                                }}
                            >
                                {VEHICLE_COLORS.map((option) => (
                                    <option key={option} value={option} style={{ background: '#0f172a' }}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span style={{ fontSize: 10, color: '#64748b' }}>차종</span>
                            <select
                                value={targetVehicleType}
                                onChange={(event) => setTargetVehicleType(event.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '8px 10px',
                                    borderRadius: 6,
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.12)',
                                    color: '#e2e8f0',
                                    fontSize: 12,
                                }}
                            >
                                {VEHICLE_TYPES.map((option) => (
                                    <option key={option} value={option} style={{ background: '#0f172a' }}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    {(phase === 'analyzing' || phase === 'tracking') && (
                        <div style={{ padding: '8px 0 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                                <div
                                    style={{
                                        width: 20,
                                        height: 20,
                                        border: '2.5px solid #38bdf8',
                                        borderTopColor: 'transparent',
                                        borderRadius: '50%',
                                        animation: 'spin 0.7s linear infinite',
                                    }}
                                />
                                <span style={{ fontSize: 12, color: '#38bdf8', fontWeight: 600 }}>
                                    {(phase === 'analyzing' ? DETECTION_STEPS : TRACK_STEPS)[stepIdx]?.label ?? '처리 중…'}
                                </span>
                            </div>

                            <div
                                style={{
                                    height: 6,
                                    background: 'rgba(255,255,255,0.06)',
                                    borderRadius: 3,
                                    overflow: 'hidden',
                                    marginBottom: 16,
                                }}
                            >
                                <div
                                    style={{
                                        height: '100%',
                                        width: `${progress}%`,
                                        background: 'linear-gradient(90deg, #0ea5e9, #38bdf8)',
                                        borderRadius: 3,
                                        transition: 'width 0.4s ease',
                                        boxShadow: '0 0 8px rgba(56,189,248,0.6)',
                                    }}
                                />
                            </div>

                            {(phase === 'analyzing' ? DETECTION_STEPS : TRACK_STEPS).map((step, index) => (
                                <div
                                    key={step.label}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        marginBottom: 7,
                                        opacity: index <= stepIdx ? 1 : 0.3,
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: 11,
                                            color: index < stepIdx ? '#22c55e' : index === stepIdx ? '#38bdf8' : '#334155',
                                        }}
                                    >
                                        {index < stepIdx ? '✓' : index === stepIdx ? '▶' : '○'}
                                    </span>
                                    <span style={{ fontSize: 11, color: index <= stepIdx ? '#94a3b8' : '#334155' }}>
                                        {step.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {phase === 'analyzed' && analysisResult && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {analysisResult.tsa_status === 'demo_fallback' && (
                                <div
                                    style={{
                                        padding: '8px 12px',
                                        background: 'rgba(245,158,11,0.08)',
                                        border: '1px solid rgba(245,158,11,0.22)',
                                        borderRadius: 8,
                                        fontSize: 11,
                                        color: '#fcd34d',
                                        lineHeight: 1.6,
                                    }}
                                >
                                    이 분석 결과는 외부 YOLO 서버가 아니라 내장 데모 fallback에서 생성됐습니다.
                                </div>
                            )}
                            {analysisResult.tsa_status === 'yolo_active' && (
                                <div
                                    style={{
                                        padding: '8px 12px',
                                        background: 'rgba(34,197,94,0.08)',
                                        border: '1px solid rgba(34,197,94,0.22)',
                                        borderRadius: 8,
                                        fontSize: 11,
                                        color: '#86efac',
                                        lineHeight: 1.6,
                                    }}
                                >
                                    이 분석 결과는 Render 상시 백엔드의 YOLO 모드에서 생성됐습니다.
                                </div>
                            )}
                            <div
                                style={{
                                    padding: '12px 14px',
                                    background: 'rgba(34,197,94,0.08)',
                                    border: '1px solid rgba(34,197,94,0.3)',
                                    borderRadius: 10,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                }}
                            >
                                <span style={{ fontSize: 24 }}>🚗</span>
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: '#22c55e', marginBottom: 2 }}>
                                        {analysisResult.verdict}
                                    </div>
                                    <div style={{ fontSize: 10, color: '#94a3b8' }}>
                                        신뢰도 {analysisResult.confidence.toFixed(1)}% · 검출 차량 {analysisResult.vehicle_count ?? 0}대
                                    </div>
                                </div>
                            </div>
                            {(analysisOcrChips.length > 0 || analysisOcrSummary?.diagnostics?.top_candidate_reason) && (
                                <div
                                    style={{
                                        padding: '8px 10px',
                                        background: 'rgba(56,189,248,0.06)',
                                        border: '1px solid rgba(56,189,248,0.16)',
                                        borderRadius: 8,
                                    }}
                                >
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#bae6fd', marginBottom: 7 }}>
                                        단일 OCR 요약
                                    </div>
                                    {analysisOcrChips.length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                            {analysisOcrChips.map((chip) => {
                                                const toneStyles = chip.tone === 'blue'
                                                    ? {
                                                        background: 'rgba(56,189,248,0.10)',
                                                        border: '1px solid rgba(56,189,248,0.18)',
                                                        color: '#bae6fd',
                                                    }
                                                    : chip.tone === 'amber'
                                                        ? {
                                                            background: 'rgba(245,158,11,0.10)',
                                                            border: '1px solid rgba(245,158,11,0.18)',
                                                            color: '#fde68a',
                                                        }
                                                        : {
                                                            background: 'rgba(148,163,184,0.10)',
                                                            border: '1px solid rgba(148,163,184,0.18)',
                                                            color: '#cbd5e1',
                                                        };
                                                return (
                                                    <div
                                                        key={`analysis-ocr-${chip.key}`}
                                                        style={{
                                                            padding: '6px 8px',
                                                            borderRadius: 999,
                                                            background: toneStyles.background,
                                                            border: toneStyles.border,
                                                            fontSize: 9,
                                                            fontWeight: 700,
                                                            color: toneStyles.color,
                                                        }}
                                                    >
                                                        {chip.label}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {analysisOcrSummary?.diagnostics?.top_candidate_reason && (
                                        <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.6, marginTop: 7 }}>
                                            대표 근거: {analysisOcrSummary.diagnostics.top_candidate_reason}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                                    gap: 8,
                                }}
                            >
                                {[
                                    { label: '입력 프레임', value: `${analysisResult.quality_report.total_input}장` },
                                    { label: '채택 프레임', value: `${analysisResult.quality_report.passed}장` },
                                    { label: getPlateSignalLabel(analysisResult), value: getPlateSignalValue(analysisResult) },
                                    { label: '이벤트', value: analysisResult.events_detected.join(', ') },
                                ].map((row) => (
                                    <div
                                        key={row.label}
                                        style={{
                                            background: 'rgba(255,255,255,0.03)',
                                            border: '1px solid rgba(255,255,255,0.07)',
                                            borderRadius: 8,
                                            padding: '9px 10px',
                                        }}
                                    >
                                        <div style={{ fontSize: 9, color: '#475569', marginBottom: 3 }}>{row.label}</div>
                                        <div style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 700, lineHeight: 1.5 }}>
                                            {row.value}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {rankedPlateCandidates.length > 0 && (
                                <div
                                    style={{
                                        padding: '10px 12px',
                                        background: 'rgba(250,204,21,0.06)',
                                        border: '1px solid rgba(250,204,21,0.16)',
                                        borderRadius: 8,
                                    }}
                                >
                                    <div style={{ fontSize: 10, color: '#fde68a', fontWeight: 800, marginBottom: 8 }}>
                                        OCR 후보 우선순위
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                        {rankedPlateCandidates.map((candidate, index) => {
                                            const isPrimary = index === 0;
                                            return (
                                                <div
                                                    key={`${candidate}-${index}`}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 6,
                                                        padding: isPrimary ? '7px 10px' : '6px 9px',
                                                        borderRadius: 999,
                                                        background: isPrimary
                                                            ? 'rgba(250,204,21,0.14)'
                                                            : 'rgba(255,255,255,0.04)',
                                                        border: isPrimary
                                                            ? '1px solid rgba(250,204,21,0.28)'
                                                            : '1px solid rgba(255,255,255,0.10)',
                                                        boxShadow: isPrimary
                                                            ? '0 0 0 1px rgba(250,204,21,0.08), 0 10px 20px rgba(161,98,7,0.10)'
                                                            : 'none',
                                                    }}
                                                >
                                                    <span
                                                        style={{
                                                            padding: '2px 6px',
                                                            borderRadius: 999,
                                                            background: isPrimary
                                                                ? 'rgba(255,255,255,0.14)'
                                                                : 'rgba(56,189,248,0.12)',
                                                            border: isPrimary
                                                                ? '1px solid rgba(255,255,255,0.18)'
                                                                : '1px solid rgba(56,189,248,0.18)',
                                                            color: isPrimary ? '#fef3c7' : '#7dd3fc',
                                                            fontSize: 9,
                                                            fontWeight: 800,
                                                        }}
                                                    >
                                                        {isPrimary ? '1순위' : `${index + 1}순위`}
                                                    </span>
                                                    <span
                                                        style={{
                                                            fontSize: isPrimary ? 12 : 11,
                                                            fontWeight: isPrimary ? 800 : 700,
                                                            color: isPrimary ? '#fef3c7' : '#e2e8f0',
                                                            letterSpacing: '0.02em',
                                                        }}
                                                    >
                                                        {candidate}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {analysisResult.ocr_diagnostics?.top_candidate_reason && (
                                        <div style={{ fontSize: 10, color: '#fde68a', marginTop: 8, lineHeight: 1.6 }}>
                                            1순위 판단 근거: {analysisResult.ocr_diagnostics.top_candidate_reason}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div
                                style={{
                                    padding: '9px 12px',
                                    background: 'rgba(99,102,241,0.07)',
                                    border: '1px solid rgba(99,102,241,0.2)',
                                    borderRadius: 8,
                                    fontSize: 11,
                                    color: '#c4b5fd',
                                }}
                            >
                                해시 체인: {analysisResult.chain_hash}
                            </div>

                            {analysisResult.ocr_diagnostics && analysisResult.ocr_status === 'ocr_active' && (
                                <div
                                    style={{
                                        padding: '9px 12px',
                                        background: 'rgba(56,189,248,0.06)',
                                        border: '1px solid rgba(56,189,248,0.18)',
                                        borderRadius: 8,
                                        fontSize: 11,
                                        color: '#bae6fd',
                                        lineHeight: 1.7,
                                        whiteSpace: 'pre-line',
                                    }}
                                >
                                    OCR 진단: 프레임 {analysisResult.ocr_diagnostics.frame_batches}개 · 관측 {analysisResult.ocr_diagnostics.observation_count}건 · 후보 {analysisResult.ocr_diagnostics.raw_candidate_count}개 → 최종 {analysisResult.ocr_diagnostics.final_candidate_count}개
                                    {analysisResult.ocr_diagnostics.suppressed_region_variants > 0
                                        ? ` · 지역접두 정리 ${analysisResult.ocr_diagnostics.suppressed_region_variants}건`
                                        : ''}
                                    {analysisResult.ocr_diagnostics.top_candidate_support > 0
                                        ? ` · 상위 후보 지지 ${analysisResult.ocr_diagnostics.top_candidate_support}프레임`
                                        : ''}
                                    {analysisResult.ocr_diagnostics.top_candidate_reason
                                        ? `\n상위 후보 설명: ${analysisResult.ocr_diagnostics.top_candidate_reason}`
                                        : ''}
                                </div>
                            )}

                            {ocrActionGuidance && (
                                <div
                                    style={{
                                        padding: '9px 12px',
                                        background:
                                            ocrActionGuidance.tone === 'success'
                                                ? 'rgba(34,197,94,0.08)'
                                                : ocrActionGuidance.tone === 'info'
                                                    ? 'rgba(14,165,233,0.08)'
                                                    : 'rgba(245,158,11,0.08)',
                                        border:
                                            ocrActionGuidance.tone === 'success'
                                                ? '1px solid rgba(34,197,94,0.22)'
                                                : ocrActionGuidance.tone === 'info'
                                                    ? '1px solid rgba(14,165,233,0.22)'
                                                    : '1px solid rgba(245,158,11,0.22)',
                                        borderRadius: 8,
                                        fontSize: 11,
                                        lineHeight: 1.7,
                                        color:
                                            ocrActionGuidance.tone === 'success'
                                                ? '#86efac'
                                                : ocrActionGuidance.tone === 'info'
                                                    ? '#7dd3fc'
                                                    : '#fcd34d',
                                    }}
                                >
                                    {ocrActionGuidance.label}: {ocrActionGuidance.value}
                                </div>
                            )}

                            {analysisRecheckCandidates.length > 0 && (
                                <div
                                    style={{
                                        padding: '10px 12px',
                                        background: 'rgba(59,130,246,0.06)',
                                        border: '1px solid rgba(59,130,246,0.16)',
                                        borderRadius: 8,
                                    }}
                                >
                                    <div style={{ fontSize: 10, color: '#93c5fd', fontWeight: 800, marginBottom: 8 }}>
                                        인접 CCTV 재확인 후보
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {analysisRecheckCandidates.map((candidate) => (
                                            <div
                                                key={`analysis-recheck-${candidate.id}`}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    gap: 10,
                                                    padding: '8px 10px',
                                                    background: 'rgba(255,255,255,0.03)',
                                                    border: '1px solid rgba(255,255,255,0.07)',
                                                    borderRadius: 8,
                                                }}
                                            >
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                        <span
                                                            style={{
                                                                padding: '2px 6px',
                                                                borderRadius: 999,
                                                                background: candidate.priorityTone === 'blue'
                                                                    ? 'rgba(56,189,248,0.12)'
                                                                    : candidate.priorityTone === 'amber'
                                                                        ? 'rgba(245,158,11,0.12)'
                                                                        : 'rgba(148,163,184,0.10)',
                                                                border: candidate.priorityTone === 'blue'
                                                                    ? '1px solid rgba(56,189,248,0.22)'
                                                                    : candidate.priorityTone === 'amber'
                                                                        ? '1px solid rgba(245,158,11,0.22)'
                                                                        : '1px solid rgba(148,163,184,0.18)',
                                                                color: candidate.priorityTone === 'blue'
                                                                    ? '#93c5fd'
                                                                    : candidate.priorityTone === 'amber'
                                                                        ? '#fcd34d'
                                                                        : '#cbd5e1',
                                                                fontSize: 9,
                                                                fontWeight: 800,
                                                            }}
                                                        >
                                                            {candidate.priorityLabel}
                                                        </span>
                                                        <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0' }}>
                                                            {candidate.name}
                                                        </div>
                                                    </div>
                                                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 3, lineHeight: 1.5 }}>
                                                        {candidate.region}
                                                        {candidate.timeWindowLabel ? ` · ${candidate.timeWindowLabel}` : ''}
                                                        {candidate.expectedEtaMinutes !== undefined ? ` · ETA ${candidate.expectedEtaMinutes}분` : ''}
                                                        {candidate.travelOrder !== undefined ? ` · 순서 ${candidate.travelOrder + 1}` : ''}
                                                        {` · ${candidate.reason}`}
                                                    </div>
                                                    {candidate.detail && (
                                                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, lineHeight: 1.5 }}>
                                                            근거: {candidate.detail}
                                                        </div>
                                                    )}
                                                </div>
                                                {onLocate && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                                                        <button
                                                            onClick={() => onLocate(candidate.id)}
                                                            style={{
                                                                padding: '6px 10px',
                                                                borderRadius: 6,
                                                                border: '1px solid rgba(59,130,246,0.22)',
                                                                background: 'rgba(59,130,246,0.08)',
                                                                color: '#93c5fd',
                                                                fontSize: 11,
                                                                fontWeight: 700,
                                                                cursor: 'pointer',
                                                            }}
                                                        >
                                                            지도 보기
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setPendingAutoRecheckCctvId(candidate.id);
                                                                onLocate(candidate.id);
                                                            }}
                                                            style={{
                                                                padding: '6px 10px',
                                                                borderRadius: 6,
                                                                border: '1px solid rgba(34,197,94,0.22)',
                                                                background: 'rgba(34,197,94,0.08)',
                                                                color: '#86efac',
                                                                fontSize: 11,
                                                                fontWeight: 700,
                                                                cursor: 'pointer',
                                                            }}
                                                        >
                                                            이동 후 재확인
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {phase === 'analyzed' && bundleAnalysisSummary && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div
                                style={{
                                    padding: '12px 14px',
                                    background: 'rgba(14,165,233,0.08)',
                                    border: '1px solid rgba(14,165,233,0.22)',
                                    borderRadius: 10,
                                }}
                            >
                                <div style={{ fontSize: 12, fontWeight: 800, color: '#38bdf8', marginBottom: 4 }}>
                                    노선 그룹 순차 분석 완료
                                </div>
                                <div style={{ fontSize: 11, color: '#e2e8f0', lineHeight: 1.6 }}>
                                    {bundleAnalysisSummary.scopeLabel} 기준 상위 {bundleAnalysisSummary.processed}대를 순차 분석했습니다.
                                    {` 1차 스캔 ${bundleAnalysisSummary.scanProcessed}대`}
                                    {bundleAnalysisSummary.verifyProcessed > 0 ? ` · 2차 정밀확인 ${bundleAnalysisSummary.verifyProcessed}대` : ''}
                                    {bundleAnalysisSummary.suggestedPlate ? ` 입력 차량번호 단서 ${bundleAnalysisSummary.suggestedPlate}` : ''}
                                    {bundleAnalysisSummary.suggestedColor ? ` · 색상 ${bundleAnalysisSummary.suggestedColor}` : ''}
                                    {bundleAnalysisSummary.suggestedVehicleType ? ` · 차종 ${bundleAnalysisSummary.suggestedVehicleType}` : ''}
                                </div>
                                {bundleOcrOverview && (
                                    <div
                                        style={{
                                            marginTop: 9,
                                            padding: '8px 10px',
                                            background: 'rgba(56,189,248,0.06)',
                                            border: '1px solid rgba(56,189,248,0.16)',
                                            borderRadius: 8,
                                            fontSize: 10,
                                            color: '#bae6fd',
                                            lineHeight: 1.7,
                                            whiteSpace: 'pre-line',
                                        }}
                                    >
                                        번들 OCR 요약: 후보 확인 {bundleOcrOverview.hitsWithCandidates}대
                                        {bundleOcrOverview.totalFinalCandidates > 0 ? ` · 최종 후보 ${bundleOcrOverview.totalFinalCandidates}개` : ''}
                                        {bundleOcrOverview.strongestSupport > 0 ? ` · 최고 지지 ${bundleOcrOverview.strongestSupport}프레임` : ''}
                                        {bundleOcrOverview.strongHits > 0 ? ` · 강함 ${bundleOcrOverview.strongHits}대` : ''}
                                        {bundleOcrOverview.moderateHits > 0 ? ` · 보통 ${bundleOcrOverview.moderateHits}대` : ''}
                                        {bundleOcrOverview.weakHits > 0 ? ` · 약함 ${bundleOcrOverview.weakHits}대` : ''}
                                        {bundleOcrOverview.hintOnlyHits > 0 ? ` · 입력 단서 기반 ${bundleOcrOverview.hintOnlyHits}대` : ''}
                                        {bundleOcrOverview.skippedHits > 0 ? ` · OCR 생략 ${bundleOcrOverview.skippedHits}대` : ''}
                                        {bundleOcrOverview.representativeReason ? `\n대표 근거: ${bundleOcrOverview.representativeReason}` : ''}
                                    </div>
                                )}
                            </div>

                            {bundleAnalysisSummary.hits.map((hit) => (
                                (() => {
                                    const bundleOcrSummary = buildOcrEvidenceSummary({
                                        ocr_status: hit.ocr_status,
                                        ocr_engine: hit.ocr_engine ?? null,
                                        plate_candidates: hit.plate_candidates,
                                        ocr_diagnostics: hit.ocr_diagnostics ?? null,
                                    });
                                    const bundleOcrChips = buildOcrSummaryChips({
                                        ocr_status: hit.ocr_status,
                                        ocr_engine: hit.ocr_engine ?? null,
                                        plate_candidates: hit.plate_candidates,
                                        ocr_diagnostics: hit.ocr_diagnostics ?? null,
                                    });

                                    return (
                                        <div
                                            key={`${hit.cctv_id}-${hit.time_window_label || 'na'}`}
                                            style={{
                                                background: 'rgba(255,255,255,0.03)',
                                                border: '1px solid rgba(255,255,255,0.07)',
                                                borderRadius: 8,
                                                padding: '10px 12px',
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>
                                                        {hit.cctv_name}
                                                    </div>
                                                    <div style={{ fontSize: 10, color: '#64748b' }}>
                                                        {hit.region}
                                                        {hit.time_window_label ? ` · ${hit.time_window_label}` : ''}
                                                        {hit.expected_eta_minutes !== undefined ? ` · ETA ${hit.expected_eta_minutes}분` : ''}
                                                        {hit.is_route_focus ? ' · 집중군' : ''}
                                                        {hit.analysis_stage === 'verify' ? ' · 2차 정밀' : ' · 1차 스캔'}
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: 12, fontWeight: 800, color: '#22c55e' }}>
                                                        {hit.confidence.toFixed(1)}%
                                                    </div>
                                                    <div style={{ fontSize: 10, color: '#64748b' }}>
                                                        검출 {hit.vehicle_count}대
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.7 }}>
                                                차량번호 단서 {hit.plate_candidates.length > 0 ? hit.plate_candidates.join(', ') : (hit.target_plate || '없음')}
                                                {' · '}
                                                색상 {hit.target_color || '미상'}
                                                {' · '}
                                                차종 {hit.target_vehicle_type || '미상'}
                                            </div>
                                            {bundleOcrChips.length > 0 && (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                                                    {bundleOcrChips.map((chip) => {
                                                        const toneStyles = chip.tone === 'blue'
                                                            ? {
                                                                background: 'rgba(56,189,248,0.10)',
                                                                border: '1px solid rgba(56,189,248,0.18)',
                                                                color: '#bae6fd',
                                                            }
                                                            : chip.tone === 'amber'
                                                                ? {
                                                                    background: 'rgba(245,158,11,0.10)',
                                                                    border: '1px solid rgba(245,158,11,0.18)',
                                                                    color: '#fde68a',
                                                                }
                                                                : {
                                                                    background: 'rgba(148,163,184,0.10)',
                                                                    border: '1px solid rgba(148,163,184,0.18)',
                                                                    color: '#cbd5e1',
                                                                };
                                                        return (
                                                            <div
                                                                key={`${hit.cctv_id}-${chip.key}`}
                                                                style={{
                                                                    padding: '6px 8px',
                                                                    borderRadius: 999,
                                                                    background: toneStyles.background,
                                                                    border: toneStyles.border,
                                                                    fontSize: 9,
                                                                    fontWeight: 700,
                                                                    color: toneStyles.color,
                                                                }}
                                                            >
                                                                {chip.label}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            {bundleOcrSummary?.diagnostics?.top_candidate_reason && (
                                                <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.6, marginTop: 7 }}>
                                                    OCR 근거: {bundleOcrSummary.diagnostics.top_candidate_reason}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()
                            ))}
                        </div>
                    )}

                    {phase === 'tracked' && trackingResult && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {backendProvider === 'fallback' && (
                                <div
                                    style={{
                                        padding: '8px 12px',
                                        background: 'rgba(245,158,11,0.08)',
                                        border: '1px solid rgba(245,158,11,0.22)',
                                        borderRadius: 8,
                                        fontSize: 11,
                                        color: '#fcd34d',
                                        lineHeight: 1.6,
                                    }}
                                >
                                    이 추적 결과는 내장 데모 fallback 기준입니다. 실제 포렌식 판정 전에는 외부 분석 서버 복구가 필요합니다.
                                </div>
                            )}
                            <div
                                style={{
                                    padding: '12px 14px',
                                    background: 'rgba(56,189,248,0.08)',
                                    border: '1px solid rgba(56,189,248,0.22)',
                                    borderRadius: 10,
                                }}
                            >
                                <div style={{ fontSize: 12, fontWeight: 800, color: '#38bdf8', marginBottom: 4 }}>
                                    추적 결과
                                </div>
                                <div style={{ fontSize: 11, color: '#e2e8f0', lineHeight: 1.6 }}>
                                    {trackingResult.message}
                                </div>
                                <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
                                    추적 ID {trackingResult.tracking_id} · 검색 카메라 {trackingResult.searched_cameras}대
                                </div>
                                {trackingResult.origin_timestamp && (
                                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                                        기준 시각 {new Date(trackingResult.origin_timestamp).toLocaleString('ko-KR')}
                                    </div>
                                )}
                                {trackingOcrOverview && (
                                    <div
                                        style={{
                                            marginTop: 9,
                                            padding: '8px 10px',
                                            background: 'rgba(56,189,248,0.06)',
                                            border: '1px solid rgba(56,189,248,0.16)',
                                            borderRadius: 8,
                                            fontSize: 10,
                                            color: '#bae6fd',
                                            lineHeight: 1.7,
                                            whiteSpace: 'pre-line',
                                        }}
                                    >
                                        추적 OCR 요약: 후보 확인 {trackingOcrOverview.hitsWithCandidates}대
                                        {trackingOcrOverview.totalFinalCandidates > 0 ? ` · 최종 후보 ${trackingOcrOverview.totalFinalCandidates}개` : ''}
                                        {trackingOcrOverview.strongestSupport > 0 ? ` · 최고 지지 ${trackingOcrOverview.strongestSupport}프레임` : ''}
                                        {trackingOcrOverview.strongHits > 0 ? ` · 강함 ${trackingOcrOverview.strongHits}대` : ''}
                                        {trackingOcrOverview.moderateHits > 0 ? ` · 보통 ${trackingOcrOverview.moderateHits}대` : ''}
                                        {trackingOcrOverview.weakHits > 0 ? ` · 약함 ${trackingOcrOverview.weakHits}대` : ''}
                                        {trackingOcrOverview.hintOnlyHits > 0 ? ` · 입력 단서 기반 ${trackingOcrOverview.hintOnlyHits}대` : ''}
                                        {trackingOcrOverview.skippedHits > 0 ? ` · OCR 생략 ${trackingOcrOverview.skippedHits}대` : ''}
                                        {trackingOcrOverview.representativeReason ? `\n대표 근거: ${trackingOcrOverview.representativeReason}` : ''}
                                    </div>
                                )}
                                {trackingInputSummary.length > 0 && (
                                    <div
                                        style={{
                                            marginTop: 10,
                                            paddingTop: 10,
                                            borderTop: '1px solid rgba(56,189,248,0.14)',
                                        }}
                                    >
                                        <div style={{ fontSize: 10, fontWeight: 700, color: '#bae6fd', marginBottom: 8 }}>
                                            이번 추적에 사용된 단서
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                            {trackingInputSummary.map((item) => (
                                                <div
                                                    key={`${item.label}-${item.value}-${item.source}`}
                                                    style={{
                                                        minWidth: 0,
                                                        padding: '8px 10px',
                                                        borderRadius: 8,
                                                        background: 'rgba(15,23,42,0.28)',
                                                        border: '1px solid rgba(125,211,252,0.12)',
                                                    }}
                                                >
                                                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>
                                                        {item.label}
                                                    </div>
                                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0' }}>
                                                        {item.value}
                                                    </div>
                                                    <div style={{ fontSize: 10, color: '#93c5fd', marginTop: 4 }}>
                                                        {item.source}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {trackingResult.origin_cctv_id && (
                                <div
                                    ref={trackingOriginCardRef}
                                    onMouseEnter={() => onTrackingActiveCctvChange?.(trackingResult.origin_cctv_id ?? null)}
                                    onFocus={() => onTrackingActiveCctvChange?.(trackingResult.origin_cctv_id ?? null)}
                                    onClick={() => onTrackingActiveCctvChange?.(trackingResult.origin_cctv_id ?? null)}
                                    tabIndex={0}
                                    style={{
                                        padding: '12px 14px',
                                        background: trackingActiveCctvId === trackingResult.origin_cctv_id
                                            ? 'rgba(251,191,36,0.10)'
                                            : 'rgba(255,255,255,0.03)',
                                        border: trackingActiveCctvId === trackingResult.origin_cctv_id
                                            ? '1px solid rgba(251,191,36,0.28)'
                                            : '1px solid rgba(255,255,255,0.07)',
                                        borderRadius: 10,
                                        boxShadow: trackingActiveCctvId === trackingResult.origin_cctv_id
                                            ? '0 0 0 1px rgba(251,191,36,0.10), 0 12px 24px rgba(180,83,9,0.10)'
                                            : 'none',
                                        outline: 'none',
                                        cursor: 'pointer',
                                        transition: 'border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease',
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span
                                                    style={{
                                                        padding: '2px 6px',
                                                        borderRadius: 999,
                                                        background: 'rgba(251,191,36,0.14)',
                                                        border: '1px solid rgba(251,191,36,0.25)',
                                                        color: '#fde68a',
                                                        fontSize: 9,
                                                        fontWeight: 800,
                                                    }}
                                                >
                                                    S
                                                </span>
                                                <div style={{ fontSize: 12, fontWeight: 700, color: '#fef3c7' }}>
                                                    {trackingResult.origin_cctv_name || cctv.name}
                                                </div>
                                            </div>
                                            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                                                출발 기준 CCTV
                                                {trackingResult.origin_timestamp
                                                    ? ` · ${new Date(trackingResult.origin_timestamp).toLocaleString('ko-KR')}`
                                                    : ''}
                                            </div>
                                        </div>
                                        {onLocate && (
                                            <button
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    onTrackingActiveCctvChange?.(trackingResult.origin_cctv_id ?? null);
                                                    onLocate(trackingResult.origin_cctv_id!);
                                                }}
                                                style={{
                                                    padding: '6px 10px',
                                                    borderRadius: 6,
                                                    border: '1px solid rgba(251,191,36,0.25)',
                                                    background: 'rgba(251,191,36,0.08)',
                                                    color: '#fde68a',
                                                    fontSize: 11,
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                시작점 보기
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {trackingResult.hits.length === 0 ? (
                                <div
                                    style={{
                                        padding: '12px 14px',
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.07)',
                                        borderRadius: 8,
                                        fontSize: 11,
                                        color: '#94a3b8',
                                    }}
                                >
                                    현재 조건과 일치하는 차량 이동 후보가 없습니다.
                                </div>
                            ) : (
                                trackingResult.hits.map((hit) => {
                                    const isActive = trackingActiveCctvId === hit.cctv_id;
                                    const trackingHintChips = buildTrackingHintChips(hit, {
                                        suggestedTrackingPlate,
                                        effectiveTargetPlate,
                                        effectiveTargetColor,
                                        effectiveTargetVehicleType,
                                        resolvedPlateSourceLabel,
                                        resolvedColorSourceLabel,
                                        resolvedVehicleTypeSourceLabel,
                                    });
                                    const trackingOcrSummary = buildOcrEvidenceSummary({
                                        ocr_status: hit.ocr_status ?? 'not_available',
                                        ocr_engine: hit.ocr_engine ?? null,
                                        plate_candidates: hit.plate_candidates ?? [],
                                        ocr_diagnostics: hit.ocr_diagnostics ?? null,
                                    });
                                    const trackingOcrChips = buildOcrSummaryChips({
                                        ocr_status: hit.ocr_status ?? 'not_available',
                                        ocr_engine: hit.ocr_engine ?? null,
                                        plate_candidates: hit.plate_candidates ?? [],
                                        ocr_diagnostics: hit.ocr_diagnostics ?? null,
                                    });
                                    return (
                                    <div
                                        key={hit.id}
                                        ref={(element) => {
                                            if (element) {
                                                trackingHitCardRefs.current[hit.cctv_id] = element;
                                                return;
                                            }
                                            delete trackingHitCardRefs.current[hit.cctv_id];
                                        }}
                                        onMouseEnter={() => onTrackingActiveCctvChange?.(hit.cctv_id)}
                                        onFocus={() => onTrackingActiveCctvChange?.(hit.cctv_id)}
                                        onClick={() => onTrackingActiveCctvChange?.(hit.cctv_id)}
                                        tabIndex={0}
                                        style={{
                                            background: isActive
                                                ? 'rgba(56,189,248,0.10)'
                                                : 'rgba(255,255,255,0.03)',
                                            border: isActive
                                                ? '1px solid rgba(56,189,248,0.30)'
                                                : '1px solid rgba(255,255,255,0.07)',
                                            borderRadius: 8,
                                            padding: '10px 12px',
                                            boxShadow: isActive
                                                ? '0 0 0 1px rgba(56,189,248,0.14), 0 12px 24px rgba(2,132,199,0.12)'
                                                : 'none',
                                            outline: 'none',
                                            cursor: 'pointer',
                                            transition: 'border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease',
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>
                                                    {hit.cctv_name}
                                                </div>
                                                <div style={{ fontSize: 10, color: '#64748b' }}>
                                                    {hit.region} · {hit.address || '주소 미상'}
                                                </div>
                                                {(hit.is_route_focus || hit.travel_order !== undefined) && (
                                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                                                        {hit.is_route_focus && (
                                                            <span
                                                                style={{
                                                                    padding: '2px 6px',
                                                                    borderRadius: 999,
                                                                    background: 'rgba(34,197,94,0.14)',
                                                                    border: '1px solid rgba(34,197,94,0.25)',
                                                                    color: '#86efac',
                                                                    fontSize: 9,
                                                                    fontWeight: 800,
                                                                }}
                                                            >
                                                                집중군
                                                            </span>
                                                        )}
                                                        {hit.travel_order !== undefined && (
                                                            <span
                                                                style={{
                                                                    padding: '2px 6px',
                                                                    borderRadius: 999,
                                                                    background: 'rgba(56,189,248,0.14)',
                                                                    border: '1px solid rgba(56,189,248,0.25)',
                                                                    color: '#7dd3fc',
                                                                    fontSize: 9,
                                                                    fontWeight: 800,
                                                                }}
                                                            >
                                                                순서 {hit.travel_order + 1}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: 12, fontWeight: 800, color: '#38bdf8' }}>
                                                    {hit.confidence.toFixed(1)}%
                                                </div>
                                                <div style={{ fontSize: 10, color: '#64748b' }}>
                                                    {new Date(hit.timestamp).toLocaleString('ko-KR')}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.7 }}>
                                            차량번호 단서 {hit.plate_candidates && hit.plate_candidates.length > 0
                                                ? hit.plate_candidates.join(', ')
                                                : (hit.plate || effectiveTargetPlate || '미상')} · 색상 {hit.color || effectiveTargetColor || '미상'} · 차종 {hit.vehicle_type || effectiveTargetVehicleType || '미상'}
                                        </div>
                                        {trackingOcrChips.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                                                {trackingOcrChips.map((chip) => {
                                                    const toneStyles = chip.tone === 'blue'
                                                        ? {
                                                            background: 'rgba(56,189,248,0.10)',
                                                            border: '1px solid rgba(56,189,248,0.18)',
                                                            color: '#bae6fd',
                                                        }
                                                        : chip.tone === 'amber'
                                                            ? {
                                                                background: 'rgba(245,158,11,0.10)',
                                                                border: '1px solid rgba(245,158,11,0.18)',
                                                                color: '#fde68a',
                                                            }
                                                            : {
                                                                background: 'rgba(148,163,184,0.10)',
                                                                border: '1px solid rgba(148,163,184,0.18)',
                                                                color: '#cbd5e1',
                                                            };
                                                    return (
                                                        <div
                                                            key={`${hit.id}-ocr-${chip.key}`}
                                                            style={{
                                                                padding: '6px 8px',
                                                                borderRadius: 999,
                                                                background: toneStyles.background,
                                                                border: toneStyles.border,
                                                                fontSize: 9,
                                                                fontWeight: 700,
                                                                color: toneStyles.color,
                                                            }}
                                                        >
                                                            {chip.label}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        {trackingOcrSummary?.diagnostics?.top_candidate_reason && (
                                            <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.6, marginTop: 7 }}>
                                                OCR 근거: {trackingOcrSummary.diagnostics.top_candidate_reason}
                                            </div>
                                        )}
                                        {trackingHintChips.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                                                {trackingHintChips.map((chip) => {
                                                    const toneStyles = chip.tone === 'blue'
                                                        ? {
                                                            background: 'rgba(56,189,248,0.10)',
                                                            border: '1px solid rgba(56,189,248,0.18)',
                                                            value: '#e0f2fe',
                                                            source: '#93c5fd',
                                                        }
                                                        : chip.tone === 'emerald'
                                                            ? {
                                                                background: 'rgba(34,197,94,0.10)',
                                                                border: '1px solid rgba(34,197,94,0.18)',
                                                                value: '#dcfce7',
                                                                source: '#86efac',
                                                            }
                                                            : {
                                                                background: 'rgba(167,139,250,0.10)',
                                                                border: '1px solid rgba(167,139,250,0.18)',
                                                                value: '#ede9fe',
                                                                source: '#c4b5fd',
                                                            };
                                                    return (
                                                        <div
                                                            key={`${hit.id}-${chip.key}`}
                                                            style={{
                                                                minWidth: 0,
                                                                padding: '7px 9px',
                                                                borderRadius: 8,
                                                                background: toneStyles.background,
                                                                border: toneStyles.border,
                                                            }}
                                                        >
                                                            <div style={{ fontSize: 9, color: '#64748b', marginBottom: 3 }}>
                                                                {chip.label}
                                                            </div>
                                                            <div style={{ fontSize: 10, fontWeight: 700, color: toneStyles.value }}>
                                                                {chip.value}
                                                            </div>
                                                            <div style={{ fontSize: 9, color: toneStyles.source, marginTop: 3 }}>
                                                                {chip.source}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        {(hit.time_window_label || hit.travel_assessment_label || hit.expected_eta_minutes !== undefined) && (
                                            <div
                                                style={{
                                                    marginTop: 7,
                                                    fontSize: 10,
                                                    color: '#94a3b8',
                                                    lineHeight: 1.6,
                                                }}
                                            >
                                                예상 구간 {hit.time_window_label || '미상'}
                                                {hit.expected_eta_minutes !== undefined ? ` · ETA ${hit.expected_eta_minutes}분` : ''}
                                                {hit.travel_assessment_label ? ` · ${hit.travel_assessment_label}` : ''}
                                            </div>
                                        )}
                                        {onLocate && hit.cctv_id && (
                                            <button
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    onTrackingActiveCctvChange?.(hit.cctv_id);
                                                    onLocate(hit.cctv_id);
                                                }}
                                                style={{
                                                    marginTop: 8,
                                                    padding: '6px 10px',
                                                    borderRadius: 6,
                                                    border: '1px solid rgba(56,189,248,0.25)',
                                                    background: 'rgba(56,189,248,0.08)',
                                                    color: '#38bdf8',
                                                    fontSize: 11,
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                지도에서 위치 확인
                                            </button>
                                        )}
                                    </div>
                                    );
                                })
                            )}
                        </div>
                    )}

                    {phase === 'error' && (
                        <div
                            style={{
                                textAlign: 'center',
                                padding: '24px',
                                color: '#ef4444',
                                background: 'rgba(127,29,29,0.16)',
                                border: '1px solid rgba(239,68,68,0.18)',
                                borderRadius: 10,
                            }}
                        >
                            <div style={{ fontSize: 36, marginBottom: 10 }}>⚠</div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>차량 분석 단계 오류</div>
                            <div style={{ fontSize: 11, color: '#fca5a5', marginTop: 6, lineHeight: 1.7 }}>
                                {errorMessage || '스트림 연결 또는 차량 분석 서버를 확인하세요.'}
                            </div>
                        </div>
                    )}
                </div>

                <div
                    style={{
                        padding: '11px 16px',
                        borderTop: '1px solid var(--border-glass)',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: 8,
                        flexWrap: 'wrap',
                    }}
                >
                    {phase !== 'analyzing' && phase !== 'tracking' && (
                        <button className="btn-neon" onClick={resetWorkflow}>
                            초기화
                        </button>
                    )}

                    {(phase === 'idle' || phase === 'error') && (
                        <>
                            {routeContext && (
                                <button className="btn-forensic" onClick={startBundleAnalysis}>
                                    노선 그룹 순차 분석 시작
                                </button>
                            )}
                            <button className="btn-neon" onClick={startAnalysis}>
                                {routeContext ? '단일 CCTV 빠른 확인' : '단일 CCTV 분석'}
                            </button>
                        </>
                    )}

                    {phase === 'analyzed' && (analysisResult || bundleAnalysisSummary) && (
                        <>
                            {analysisResult && (
                                <button
                                    className="btn-neon"
                                    onClick={() => exportEvidence(
                                        analysisEvidencePayload ?? analysisResult,
                                        `vehicle_analysis_${analysisResult.job_id.slice(0, 8)}.json`
                                    )}
                                >
                                    분석 결과 저장
                                </button>
                            )}
                            {analysisResult && hasTargetHints && (analysisResult.vehicle_count ?? 0) > 0 && (
                                <button className="btn-neon" onClick={startVerifyAnalysis}>
                                    2차 정밀 확인 (보조)
                                </button>
                            )}
                            {bundleAnalysisSummary && (
                                <button
                                    className="btn-neon"
                                    onClick={() => exportEvidence(
                                        bundleEvidencePayload ?? bundleAnalysisSummary,
                                        `route_bundle_analysis_${cctv.id.slice(0, 8)}.json`
                                    )}
                                >
                                    노선 분석 저장
                                </button>
                            )}
                            <button className="btn-forensic" onClick={startTracking}>
                                ITS 차량 추적 시작
                            </button>
                        </>
                    )}

                    {phase === 'tracked' && trackingResult && (
                        <button
                            className="btn-forensic"
                            onClick={() => exportEvidence(
                                trackingEvidencePayload ?? {
                                    analysis: analysisResult,
                                    tracking: trackingResult,
                                },
                                `vehicle_tracking_${trackingResult.tracking_id.slice(0, 8)}.json`
                            )}
                        >
                            추적 결과 저장
                        </button>
                    )}

                    <button
                        onClick={onClose}
                        style={{
                            padding: '7px 16px',
                            borderRadius: 6,
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: 'rgba(255,255,255,0.04)',
                            color: '#64748b',
                            fontSize: 11,
                            cursor: 'pointer',
                            fontWeight: 700,
                        }}
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
}
