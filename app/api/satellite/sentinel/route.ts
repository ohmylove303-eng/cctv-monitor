import { NextResponse } from 'next/server';
import {
    buildSentinelImageCoordinates,
    getSentinelConfig,
    resolveSentinelDate,
    resolveSentinelBBox,
    resolveSentinelOutputSize,
} from '@/lib/sentinel';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const requestUrl = new URL(request.url);
    const { searchParams } = requestUrl;
    const date = resolveSentinelDate(searchParams.get('date'));
    const bbox = resolveSentinelBBox(searchParams.get('bbox'));
    const { width, height } = resolveSentinelOutputSize(searchParams.get('width'), searchParams.get('height'));
    const { clientId, clientSecret, instanceId, layer } = getSentinelConfig();

    if (clientId && clientSecret) {
        const imageQuery = new URLSearchParams({
            date,
            bbox: bbox.join(','),
            width: String(width),
            height: String(height),
        });

        return NextResponse.json(
            {
                mode: 'image',
                imageUrl: `/api/satellite/sentinel/image?${imageQuery.toString()}`,
                coordinates: buildSentinelImageCoordinates(bbox),
                date,
                width,
                height,
                fallback: false,
            },
            {
                headers: { 'Cache-Control': 'no-store' },
            }
        );
    }

    if (instanceId) {
        const tileUrl =
            `https://services.sentinel-hub.com/ogc/wms/${instanceId}` +
            `?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
            `&LAYERS=${encodeURIComponent(layer)}` +
            `&CRS=EPSG:3857&WIDTH=512&HEIGHT=512&FORMAT=image/png` +
            `&TIME=${date}` +
            `&BBOX={bbox-epsg-3857}`;

        return NextResponse.json(
            {
                mode: 'tile',
                tileUrl,
                layer,
                date,
                fallback: false,
            },
            {
                headers: { 'Cache-Control': 'no-store' },
            }
        );
    }

    return NextResponse.json(
        {
            mode: 'fallback',
            imageUrl: null,
            tileUrl: null,
            layer,
            date,
            fallback: true,
            message: 'Sentinel credentials are not set',
        },
        {
            headers: { 'Cache-Control': 'no-store' },
        }
    );
}
