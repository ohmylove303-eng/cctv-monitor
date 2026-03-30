import { NextResponse } from 'next/server';
import { getGoogleMapsConfig, getGoogleTileSession, resolveGoogleBasemapStyle } from '@/lib/google-maps';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseTileCoordinate(value: string, name: string) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`Invalid ${name}`);
    }
    return parsed;
}

export async function GET(
    _request: Request,
    { params }: { params: { style: string; z: string; x: string; y: string } }
) {
    try {
        const style = resolveGoogleBasemapStyle(params.style);
        const z = parseTileCoordinate(params.z, 'z');
        const x = parseTileCoordinate(params.x, 'x');
        const y = parseTileCoordinate(params.y, 'y');
        const { apiKey } = getGoogleMapsConfig();

        if (!apiKey) {
            return NextResponse.json(
                { error: 'Google Maps basemap key is not configured' },
                {
                    status: 503,
                    headers: { 'Cache-Control': 'no-store' },
                }
            );
        }

        const session = await getGoogleTileSession(style);
        const tileUrl =
            `https://tile.googleapis.com/v1/2dtiles/${z}/${x}/${y}` +
            `?session=${encodeURIComponent(session.token)}` +
            `&key=${encodeURIComponent(apiKey)}`;

        const response = await fetch(tileUrl, {
            cache: 'no-store',
            headers: {
                Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            },
        });

        if (!response.ok || !response.body) {
            const errorText = await response.text().catch(() => '');
            return NextResponse.json(
                {
                    error: errorText || `Google tile fetch failed (${response.status})`,
                },
                {
                    status: response.status || 502,
                    headers: { 'Cache-Control': 'no-store' },
                }
            );
        }

        const headers = new Headers();
        headers.set(
            'Content-Type',
            response.headers.get('content-type')
            ?? (session.imageFormat === 'jpeg' ? 'image/jpeg' : 'image/png')
        );
        headers.set(
            'Cache-Control',
            response.headers.get('cache-control')
            ?? 'public, max-age=3600, stale-while-revalidate=86400'
        );

        const etag = response.headers.get('etag');
        const expires = response.headers.get('expires');
        const lastModified = response.headers.get('last-modified');

        if (etag) headers.set('ETag', etag);
        if (expires) headers.set('Expires', expires);
        if (lastModified) headers.set('Last-Modified', lastModified);

        return new Response(response.body, {
            status: response.status,
            headers,
        });
    } catch (error) {
        return NextResponse.json(
            {
                error: error instanceof Error
                    ? error.message
                    : 'Google tile proxy failed',
            },
            {
                status: 400,
                headers: { 'Cache-Control': 'no-store' },
            }
        );
    }
}
