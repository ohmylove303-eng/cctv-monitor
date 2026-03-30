export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { fetchGimpoItsCctv } from '@/lib/gimpo-its';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const type = (searchParams.get('type') ?? 'main') as 'main' | 'cross' | 'all';

    try {
        const data = await fetchGimpoItsCctv(type);

        return NextResponse.json({
            success: true,
            count: data.length,
            cameras: data,
            fetchedAt: new Date().toISOString(),
        });

    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[gimpo-cctv]', msg);
        return NextResponse.json(
            { success: false, error: msg, cameras: [] },
            { status: 502 }
        );
    }
}
