import { NextResponse } from 'next/server';
import { getPlanetConfig } from '@/lib/planet';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = {
    itemId: string;
    z: string;
    x: string;
    y: string;
};

export async function GET(
    _request: Request,
    { params }: { params: Params }
) {
    const { apiKey, itemType } = getPlanetConfig();
    if (!apiKey) {
        return NextResponse.json(
            {
                error: 'Planet SkySat API key is not configured',
            },
            {
                status: 503,
                headers: { 'Cache-Control': 'no-store' },
            }
        );
    }

    const { itemId, z, x, y } = params;
    const planetTileUrl =
        `https://tiles0.planet.com/data/v1/${itemType}/${itemId}/${z}/${x}/${y}.png` +
        `?api_key=${encodeURIComponent(apiKey)}&empty=404`;

    try {
        const tileResponse = await fetch(planetTileUrl, {
            cache: 'no-store',
            headers: {
                Accept: 'image/png,image/*;q=0.8',
            },
        });

        if (!tileResponse.ok) {
            return new NextResponse(await tileResponse.text(), {
                status: tileResponse.status,
                headers: {
                    'Cache-Control': 'no-store',
                    'Content-Type': tileResponse.headers.get('content-type') || 'text/plain; charset=utf-8',
                },
            });
        }

        const tileBuffer = await tileResponse.arrayBuffer();
        return new NextResponse(tileBuffer, {
            headers: {
                'Content-Type': tileResponse.headers.get('content-type') || 'image/png',
                'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
            },
        });
    } catch (error) {
        console.error('[Planet SkySat Tile Error]', error);
        return NextResponse.json(
            {
                error: 'Planet SkySat tile fetch failed',
            },
            {
                status: 500,
                headers: { 'Cache-Control': 'no-store' },
            }
        );
    }
}
