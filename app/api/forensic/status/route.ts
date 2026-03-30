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
        message: probe.message,
    });
}
