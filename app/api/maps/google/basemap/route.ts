import { NextResponse } from 'next/server';
import {
    fetchGoogleViewportInfo,
    getGoogleTileSession,
    hasGoogleMapsApiKey,
    resolveGoogleBasemapStyle,
    resolveGoogleViewportRequest,
} from '@/lib/google-maps';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
    if (!hasGoogleMapsApiKey()) {
        return NextResponse.json(
            { error: 'Google Maps basemap key is not configured' },
            {
                status: 503,
                headers: { 'Cache-Control': 'no-store' },
            }
        );
    }

    try {
        const requestUrl = new URL(request.url);
        const style = resolveGoogleBasemapStyle(requestUrl.searchParams.get('style'));
        const sessionStyle = style === 'hybrid' ? 'satellite' : style;
        const bounds = resolveGoogleViewportRequest(requestUrl.searchParams);
        const viewport = await fetchGoogleViewportInfo(sessionStyle, bounds);
        const session = await getGoogleTileSession(sessionStyle);

        return NextResponse.json(
            {
                provider: 'google',
                style,
                tileUrl: `/api/maps/google/tiles/${sessionStyle}/{z}/{x}/{y}`,
                tileSize: session.tileWidth,
                safeMaxZoom: viewport.safeMaxZoom,
                copyright: viewport.copyright,
            },
            {
                headers: { 'Cache-Control': 'no-store' },
            }
        );
    } catch (error) {
        return NextResponse.json(
            {
                error: error instanceof Error
                    ? error.message
                    : 'Google basemap viewport fetch failed',
            },
            {
                status: 502,
                headers: { 'Cache-Control': 'no-store' },
            }
        );
    }
}
