import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MOSAIC_NAME = 'planet_medres_visual_2026-02_mosaic';

export async function GET() {
    const apiKey = process.env.PLANET_API_KEY;

    if (!apiKey) {
        return NextResponse.json({
            tileUrl: null,
            mosaicName: MOSAIC_NAME,
            fallback: true,
            message: 'PLANET_API_KEY not set',
        });
    }

    // Planet Labs XYZ 타일 URL ({z}/{x}/{y} 플레이스홀더 유지)
    const tileUrl =
        `https://tiles.planet.com/basemaps/v1/planet-tiles/` +
        `${MOSAIC_NAME}/gmap/{z}/{x}/{y}.png?api_key=${apiKey}`;

    return NextResponse.json(
        {
            tileUrl,
            mosaicName: MOSAIC_NAME,
        },
        {
            headers: { 'Cache-Control': 'no-store' },
        }
    );
}
