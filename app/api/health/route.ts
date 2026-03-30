import { NextResponse } from 'next/server';
import { probeForensicApi } from '@/lib/forensic-server';
import { resolveSentinelDate } from '@/lib/sentinel';
import {
    getOfficialCoordinateFileStats,
    getOfficialCoordinateInputSummary,
    loadOfficialCoordinateOverrides,
} from '@/lib/official-coordinates';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type CheckStatus = 'ok' | 'degraded' | 'error';

type JsonCheckResult = {
    ok: boolean;
    httpStatus: number;
    durationMs: number;
    payload: unknown;
    error?: string;
};

const CHECK_TIMEOUT_MS = 15000;

async function fetchJson(url: string): Promise<JsonCheckResult> {
    const controller = new AbortController();
    const startedAt = Date.now();
    const timeoutId = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            cache: 'no-store',
            headers: {
                Accept: 'application/json',
            },
            signal: controller.signal,
        });

        const payload = await response.json().catch(() => null);

        return {
            ok: response.ok,
            httpStatus: response.status,
            durationMs: Date.now() - startedAt,
            payload,
            error: response.ok
                ? undefined
                : (payload as { error?: string; message?: string } | null)?.error
                ?? (payload as { error?: string; message?: string } | null)?.message
                ?? `HTTP ${response.status}`,
        };
    } catch (error) {
        return {
            ok: false,
            httpStatus: 0,
            durationMs: Date.now() - startedAt,
            payload: null,
            error: error instanceof Error ? error.message : 'Unknown fetch error',
        };
    } finally {
        clearTimeout(timeoutId);
    }
}

function countBy<T extends string>(items: T[]) {
    return items.reduce<Record<string, number>>((acc, item) => {
        acc[item] = (acc[item] ?? 0) + 1;
        return acc;
    }, {});
}

function resolveCoordinateQuality(item: { coordinateVerified?: boolean; coordinateSource?: string; source?: string }) {
    if (item.coordinateSource === 'official') return 'official';
    if (item.coordinateVerified === true || item.coordinateSource === 'its_api') return 'verified';
    if (item.coordinateVerified === false || item.coordinateSource === 'seed') return 'approximate';
    return 'unknown';
}

export async function GET(request: Request) {
    const baseUrl = new URL(request.url).origin;
    const date = resolveSentinelDate(new Date().toISOString().slice(0, 10));
    const forensicProbePromise = probeForensicApi();
    const coordinateFilesPromise = getOfficialCoordinateFileStats();
    const coordinateOverridesPromise = loadOfficialCoordinateOverrides();
    const coordinateInputSummaryPromise = getOfficialCoordinateInputSummary();

    const [cctvCheck, sentinelCheck, tleCheck] = await Promise.all([
        fetchJson(`${baseUrl}/api/cctv`),
        fetchJson(`${baseUrl}/api/satellite/sentinel?date=${encodeURIComponent(date)}`),
        fetchJson(`${baseUrl}/api/tle`),
    ]);
    const [forensicProbe, coordinateFiles, coordinateOverrides, coordinateInputSummary] = await Promise.all([
        forensicProbePromise,
        coordinateFilesPromise,
        coordinateOverridesPromise,
        coordinateInputSummaryPromise,
    ]);

    const cctvItems = Array.isArray(cctvCheck.payload) ? cctvCheck.payload : [];
    const tleItems = Array.isArray(tleCheck.payload) ? tleCheck.payload : [];
    const sentinelPayload = (sentinelCheck.payload ?? {}) as {
        mode?: string;
        fallback?: boolean;
        date?: string;
        message?: string;
        error?: string;
    };

    const cctvStatus: CheckStatus = !cctvCheck.ok
        ? 'error'
        : cctvItems.length === 0
            ? 'degraded'
            : 'ok';

    const sentinelStatus: CheckStatus = !sentinelCheck.ok
        ? 'degraded'
        : sentinelPayload.fallback
            ? 'degraded'
            : 'ok';

    const tleStatus: CheckStatus = !tleCheck.ok
        ? 'error'
        : tleItems.length === 0
            ? 'degraded'
            : 'ok';

    const overallStatus: CheckStatus =
        cctvStatus === 'error' || tleStatus === 'error'
            ? 'error'
            : cctvStatus === 'degraded'
                || sentinelStatus === 'degraded'
                || tleStatus === 'degraded'
                || (forensicProbe.enabled && !forensicProbe.reachable)
                ? 'degraded'
                : 'ok';

    const body = {
        checkedAt: new Date().toISOString(),
        status: overallStatus,
        services: {
            cctv: {
                status: cctvStatus,
                httpStatus: cctvCheck.httpStatus,
                durationMs: cctvCheck.durationMs,
                total: cctvItems.length,
                byRegion: countBy(
                    cctvItems
                        .map((item) => (item as { region?: string }).region)
                        .filter((region): region is string => Boolean(region))
                ),
                byType: countBy(
                    cctvItems
                        .map((item) => (item as { type?: string }).type)
                        .filter((type): type is string => Boolean(type))
                ),
                byCoordinateQuality: countBy(
                    cctvItems.map((item) => resolveCoordinateQuality(item as {
                        coordinateVerified?: boolean;
                        coordinateSource?: string;
                        source?: string;
                    }))
                ),
                coordinateFiles: coordinateFiles
                    .filter((file) => file.exists)
                    .map((file) => ({ type: file.type, path: file.path })),
                officialOverrideCount: coordinateOverrides.length,
                coordinateInputSummary,
                error: cctvCheck.error ?? null,
            },
            sentinel: {
                status: sentinelStatus,
                httpStatus: sentinelCheck.httpStatus,
                durationMs: sentinelCheck.durationMs,
                mode: sentinelPayload.mode ?? null,
                date: sentinelPayload.date ?? date,
                fallback: Boolean(sentinelPayload.fallback),
                error: sentinelCheck.error ?? sentinelPayload.error ?? sentinelPayload.message ?? null,
            },
            tle: {
                status: tleStatus,
                httpStatus: tleCheck.httpStatus,
                durationMs: tleCheck.durationMs,
                total: tleItems.length,
                sample: tleItems
                    .slice(0, 5)
                    .map((item) => (item as { name?: string }).name)
                    .filter((name): name is string => Boolean(name)),
                error: tleCheck.error ?? null,
            },
            forensic: {
                status: !forensicProbe.enabled
                    ? 'degraded'
                    : forensicProbe.reachable
                        ? 'ok'
                        : 'degraded',
                configured: forensicProbe.enabled,
                reachable: forensicProbe.reachable,
                httpStatus: forensicProbe.httpStatus,
                message: forensicProbe.message,
            },
        },
    };

    return NextResponse.json(body, {
        status: overallStatus === 'error' ? 503 : 200,
        headers: {
            'Cache-Control': 'no-store',
        },
    });
}
