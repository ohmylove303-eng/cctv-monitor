import {
    createFallbackAnalyzeResponse,
    createFallbackTrackResponse,
    isForensicFallbackAvailable,
    readFallbackTrackResult,
} from '@/lib/forensic-fallback';

const FORENSIC_API_BASE =
    process.env.FORENSIC_API_URL?.trim()
    || process.env.NEXT_PUBLIC_FORENSIC_API?.trim()
    || '';
const PROBE_TIMEOUT_MS = 45000;
const ANALYZE_PROXY_TIMEOUT_MS = 130000;
const UPSTREAM_WAKE_RETRY_DELAY_MS = 10000;
const UPSTREAM_MAX_ATTEMPTS = 2;

type ForensicOcrProbe = {
    engine?: string;
    configured?: boolean;
    attempted?: boolean;
    ready?: boolean;
    lazy_load?: boolean;
    status?: string;
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
};

type ForensicVehicleReferenceProbe = {
    status?: string;
    path?: string;
    entries?: number;
    error?: string | null;
};

type ForensicVehicleVmmrReadinessProbe = {
    status?: string;
    path?: string;
    datasets?: number;
    model_reports?: number;
    active_models?: number;
    activation_threshold?: number;
    fine_grained_model_ready?: boolean;
    error?: string | null;
};

type ForensicVehicleReidReadinessProbe = {
    status?: string;
    path?: string;
    datasets?: number;
    model_reports?: number;
    active_models?: number;
    activation_threshold?: number;
    max_false_positive_rate?: number;
    same_vehicle_reid_ready?: boolean;
    runtime_integrated?: boolean;
    error?: string | null;
};

type ForensicVehicleReidRuntimeProbe = {
    taxonomy?: string;
    backend?: string;
    status?: string;
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
};

type ForensicVehicleReidRuntimeBacktestProbe = {
    taxonomy?: string;
    status?: string;
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
};

type ForensicTrackingStoreProbe = {
    backend?: string;
    requested_backend?: string;
    configured?: boolean;
    dsn_configured?: boolean;
    table?: string | null;
    path?: string | null;
    memory_results?: number;
    persisted_results?: number;
    durable?: boolean;
    external_db?: boolean;
    error?: string | null;
};

type ForensicExecutionHarnessProbe = {
    taxonomy?: string;
    status?: string;
    current_stage?: string;
    current_stage_model?: string;
    current_goal?: string;
    phases?: Array<{ stage?: string; model?: string }>;
};

function trimTrailingSlash(value: string) {
    return value.replace(/\/+$/, '');
}

function buildProbeUrl() {
    const base = trimTrailingSlash(FORENSIC_API_BASE);
    return `${base}/healthz`;
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildHeaders(initHeaders?: HeadersInit) {
    const headers = new Headers(initHeaders);
    if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }
    return headers;
}

export function isForensicConfigured() {
    return Boolean(FORENSIC_API_BASE);
}

export function getForensicConfigMessage() {
    return isForensicConfigured()
        ? 'ITS 차량 분석 백엔드 연결 준비됨'
        : 'FORENSIC_API_URL 환경변수가 없어 YOLO 차량 분석/추적 서버에 연결할 수 없습니다.';
}

function fallbackProbe(message?: string) {
    return {
        enabled: true,
        reachable: true,
        httpStatus: 200,
        provider: 'fallback' as const,
        mode: 'fallback',
        ocr: null,
        vehicleReference: null,
        vehicleVmmrReadiness: null,
        vehicleReidReadiness: null,
        vehicleReidRuntime: null,
        vehicleReidRuntimeBacktest: null,
        trackingStore: null,
        executionHarness: null,
        message: message || '외부 ITS 차량 분석 백엔드 미응답. 내장 데모 fallback으로 계속 운용합니다.',
    };
}

export async function probeForensicApi() {
    if (!FORENSIC_API_BASE) {
        return isForensicFallbackAvailable()
            ? fallbackProbe('외부 ITS 차량 분석 백엔드가 없어 내장 데모 fallback으로 운용합니다.')
            : {
                enabled: false,
                reachable: false,
                httpStatus: 0,
                provider: 'missing' as const,
                mode: null,
                ocr: null,
                vehicleReference: null,
                vehicleVmmrReadiness: null,
                vehicleReidReadiness: null,
                vehicleReidRuntime: null,
                vehicleReidRuntimeBacktest: null,
                trackingStore: null,
                executionHarness: null,
                message: getForensicConfigMessage(),
            };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    try {
        const response = await fetch(buildProbeUrl(), {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
        });

        const payload = await response.json().catch(() => null) as {
            mode?: string;
            ocr?: ForensicOcrProbe;
            vehicle_reference?: ForensicVehicleReferenceProbe;
            vehicle_vmmr_readiness?: ForensicVehicleVmmrReadinessProbe;
            vehicle_reid_readiness?: ForensicVehicleReidReadinessProbe;
            vehicle_reid_runtime?: ForensicVehicleReidRuntimeProbe;
            vehicle_reid_runtime_backtest?: ForensicVehicleReidRuntimeBacktestProbe;
            tracking_store?: ForensicTrackingStoreProbe;
            execution_harness?: ForensicExecutionHarnessProbe;
        } | null;
        const modeLabel = typeof payload?.mode === 'string' ? payload.mode : null;
        const ocr = payload?.ocr && typeof payload.ocr === 'object' ? payload.ocr : null;
        const vehicleReference = payload?.vehicle_reference && typeof payload.vehicle_reference === 'object'
            ? payload.vehicle_reference
            : null;
        const vehicleVmmrReadiness = payload?.vehicle_vmmr_readiness && typeof payload.vehicle_vmmr_readiness === 'object'
            ? payload.vehicle_vmmr_readiness
            : null;
        const vehicleReidReadiness = payload?.vehicle_reid_readiness && typeof payload.vehicle_reid_readiness === 'object'
            ? payload.vehicle_reid_readiness
            : null;
        const vehicleReidRuntime = payload?.vehicle_reid_runtime && typeof payload.vehicle_reid_runtime === 'object'
            ? payload.vehicle_reid_runtime
            : null;
        const vehicleReidRuntimeBacktest = payload?.vehicle_reid_runtime_backtest && typeof payload.vehicle_reid_runtime_backtest === 'object'
            ? payload.vehicle_reid_runtime_backtest
            : null;
        const trackingStore = payload?.tracking_store && typeof payload.tracking_store === 'object'
            ? payload.tracking_store
            : null;
        const executionHarness = payload?.execution_harness && typeof payload.execution_harness === 'object'
            ? payload.execution_harness
            : null;

        return {
            enabled: true,
            reachable: true,
            httpStatus: response.status,
            provider: 'configured' as const,
            mode: modeLabel,
            ocr,
            vehicleReference,
            vehicleVmmrReadiness,
            vehicleReidReadiness,
            vehicleReidRuntime,
            vehicleReidRuntimeBacktest,
            trackingStore,
            executionHarness,
            message: response.ok
                ? `ITS 차량 분석 백엔드 응답 확인됨${modeLabel ? ` (${modeLabel})` : ''}`
                : `ITS 차량 분석 백엔드 연결됨 (HTTP ${response.status})`,
        };
    } catch (error) {
        const isAbort = error instanceof Error && error.name === 'AbortError';
        if (isAbort) {
            return {
                enabled: true,
                reachable: true,
                httpStatus: 200,
                provider: 'configured' as const,
                mode: null,
                ocr: null,
                vehicleReference: null,
                vehicleVmmrReadiness: null,
                vehicleReidReadiness: null,
                vehicleReidRuntime: null,
                vehicleReidRuntimeBacktest: null,
                trackingStore: null,
                executionHarness: null,
                message: 'ITS 차량 분석 백엔드가 기동 중이거나 Render free warmup 중입니다. 실제 분석 요청은 계속 외부 백엔드를 우선 사용합니다.',
            };
        }
        return isForensicFallbackAvailable()
            ? fallbackProbe(
                error instanceof Error
                    ? `외부 ITS 차량 분석 백엔드 미응답: ${error.message}. 내장 데모 fallback으로 운용합니다.`
                    : '외부 ITS 차량 분석 백엔드 미응답. 내장 데모 fallback으로 운용합니다.',
            )
            : {
                enabled: true,
                reachable: false,
                httpStatus: 0,
                provider: 'configured' as const,
                mode: null,
                ocr: null,
                vehicleReference: null,
                vehicleVmmrReadiness: null,
                vehicleReidReadiness: null,
                vehicleReidRuntime: null,
                vehicleReidRuntimeBacktest: null,
                trackingStore: null,
                executionHarness: null,
                message: error instanceof Error
                    ? `ITS 차량 분석 백엔드 미응답: ${error.message}`
                    : 'ITS 차량 분석 백엔드 미응답',
            };
    } finally {
        clearTimeout(timeout);
    }
}

async function buildFallbackResponse(path: string, init?: RequestInit) {
    const method = (init?.method || 'GET').toUpperCase();
    const bodyText = typeof init?.body === 'string' ? init.body : '';
    const payload = (() => {
        if (!bodyText) return {};
        try {
            return JSON.parse(bodyText) as Record<string, unknown>;
        } catch {
            return {};
        }
    })();

    if (path === '/api/analyze' && method === 'POST') {
        return Response.json(createFallbackAnalyzeResponse(payload), {
            status: 200,
            headers: {
                'Cache-Control': 'no-store',
                'X-Forensic-Provider': 'fallback',
            },
        });
    }

    if (path === '/api/track' && method === 'POST') {
        return Response.json(createFallbackTrackResponse(payload), {
            status: 200,
            headers: {
                'Cache-Control': 'no-store',
                'X-Forensic-Provider': 'fallback',
            },
        });
    }

    if (path.startsWith('/api/track/') && method === 'GET') {
        const trackingId = decodeURIComponent(path.split('/').pop() || '');
        const result = readFallbackTrackResult(trackingId);
        return result
            ? Response.json(result, {
                status: 200,
                headers: {
                    'Cache-Control': 'no-store',
                    'X-Forensic-Provider': 'fallback',
                },
            })
            : Response.json(
                {
                    tracking_id: trackingId,
                    status: 'completed',
                    searched_cameras: 0,
                    hits: [],
                    message: '내장 데모 fallback은 즉시 완료형이라 개별 재조회 상태를 보존하지 않습니다.',
                },
                {
                    status: 200,
                    headers: {
                        'Cache-Control': 'no-store',
                        'X-Forensic-Provider': 'fallback',
                    },
                },
            );
    }

    return Response.json(
        {
            status: 'error',
            message: `fallback path not supported: ${method} ${path}`,
        },
        { status: 400 },
    );
}

export async function proxyForensic(path: string, init?: RequestInit) {
    if (!FORENSIC_API_BASE) {
        return buildFallbackResponse(path, init);
    }

    try {
        for (let attempt = 1; attempt <= UPSTREAM_MAX_ATTEMPTS; attempt += 1) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), ANALYZE_PROXY_TIMEOUT_MS);

            try {
                const upstream = await fetch(`${FORENSIC_API_BASE}${path}`, {
                    ...init,
                    headers: buildHeaders(init?.headers),
                    cache: 'no-store',
                    signal: controller.signal,
                });

                const text = await upstream.text();
                const renderRouting = upstream.headers.get('x-render-routing') || '';
                const isHibernateWakeError = upstream.status === 503
                    && renderRouting.includes('hibernate-wake-error');

                if (isHibernateWakeError && attempt < UPSTREAM_MAX_ATTEMPTS) {
                    await fetch(buildProbeUrl(), {
                        method: 'GET',
                        cache: 'no-store',
                    }).catch(() => null);
                    await sleep(UPSTREAM_WAKE_RETRY_DELAY_MS);
                    continue;
                }

                if (!upstream.ok && (upstream.status >= 500 || upstream.status === 404)) {
                    return buildFallbackResponse(path, init);
                }
                return new Response(text, {
                    status: upstream.status,
                    headers: {
                        'Content-Type': upstream.headers.get('content-type') || 'application/json',
                        'Cache-Control': 'no-store',
                    },
                });
            } finally {
                clearTimeout(timeout);
            }
        }
    } catch (error) {
        return buildFallbackResponse(path, init);
    }

    return buildFallbackResponse(path, init);
}
