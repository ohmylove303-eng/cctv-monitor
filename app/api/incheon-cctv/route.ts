export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

import { fetchIncheonUticCctv } from '@/lib/incheon-utic';

export async function GET() {
    try {
        const cameras = await fetchIncheonUticCctv();

        return NextResponse.json({
            success: true,
            count: cameras.length,
            cameras,
            fetchedAt: new Date().toISOString(),
        }, {
            headers: {
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[incheon-cctv]', message);
        return NextResponse.json({
            success: false,
            error: message,
            cameras: [],
        }, {
            status: 502,
        });
    }
}
