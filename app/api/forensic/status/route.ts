import { NextResponse } from 'next/server';
import { probeForensicApi } from '@/lib/forensic-server';

export const dynamic = 'force-dynamic';

export async function GET() {
    const probe = await probeForensicApi();

    return NextResponse.json({
        enabled: probe.enabled,
        provider: probe.provider,
        reachable: probe.reachable,
        httpStatus: probe.httpStatus,
        mode: probe.mode,
        ocr: probe.ocr,
        vehicleReference: probe.vehicleReference ?? null,
        vehicleVmmrReadiness: probe.vehicleVmmrReadiness ?? null,
        vehicleReidReadiness: probe.vehicleReidReadiness ?? null,
        vehicleReidRuntime: probe.vehicleReidRuntime ?? null,
        vehicleReidRuntimeBacktest: probe.vehicleReidRuntimeBacktest ?? null,
        trackingStore: probe.trackingStore ?? null,
        executionHarness: probe.executionHarness ?? null,
        message: probe.message,
    });
}
