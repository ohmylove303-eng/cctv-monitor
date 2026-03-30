import { NextResponse } from 'next/server';
import {
    getOfficialCoordinateFileStats,
    getOfficialCoordinateInputSummary,
    loadOfficialCoordinateOverrides,
} from '@/lib/official-coordinates';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
    const [files, overrides, inputSummary] = await Promise.all([
        getOfficialCoordinateFileStats(),
        loadOfficialCoordinateOverrides(),
        getOfficialCoordinateInputSummary(),
    ]);

    return NextResponse.json({
        status: 'ok',
        loadedAt: new Date().toISOString(),
        files,
        totalOverrides: overrides.length,
        inputSummary,
        sample: overrides.slice(0, 5),
    }, {
        headers: {
            'Cache-Control': 'no-store',
        },
    });
}
