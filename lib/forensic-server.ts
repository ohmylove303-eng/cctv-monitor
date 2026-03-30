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
const PROBE_TIMEOUT_MS = 15000;
const ANALYZE_PROXY_TIMEOUT_MS = 90000;

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
                message: getForensicConfigMessage(),
            };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    try {
        const response = await fetch(FORENSIC_API_BASE, {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
        });

        return {
            enabled: true,
            reachable: true,
            httpStatus: response.status,
            provider: 'configured' as const,
            message: response.ok
                ? 'ITS 차량 분석 백엔드 응답 확인됨'
                : `ITS 차량 분석 백엔드 연결됨 (HTTP ${response.status})`,
        };
    } catch (error) {
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
    } catch (error) {
        return buildFallbackResponse(path, init);
    } finally {
        clearTimeout(timeout);
    }
}
