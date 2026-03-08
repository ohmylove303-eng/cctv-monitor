import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const instanceId = process.env.SENTINEL_INSTANCE_ID;

    if (!instanceId) {
        return NextResponse.json({
            tileUrl: null,
            layer: 'TRUE-COLOR',
            date: new Date().toISOString().split('T')[0],
            fallback: true,
            message: 'SENTINEL_INSTANCE_ID not set',
        });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') ?? new Date().toISOString().split('T')[0];

    // Sentinel Hub WMS URL 구성 (MapLibre raster source 호환)
    // WMTS는 MapLibre에서 직접 쓰기 어려우므로 WMS bbox 방식 사용
    const tileUrl =
        `https://services.sentinel-hub.com/ogc/wms/${instanceId}` +
        `?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
        `&LAYERS=TRUE-COLOR&CRS=EPSG:3857` +
        `&WIDTH=256&HEIGHT=256&FORMAT=image/png` +
        `&TIME=${date}` +
        `&BBOX={bbox-epsg-3857}`;

    return NextResponse.json(
        {
            tileUrl,
            layer: 'TRUE-COLOR',
            date,
            instanceId, // 프론트에서 직접 URL 구성 시 사용
        },
        {
            headers: { 'Cache-Control': 'no-store' },
        }
    );
}
