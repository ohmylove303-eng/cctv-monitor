import { NextResponse } from 'next/server';
import {
    buildPlanetQuickSearchBody,
    getPlanetConfig,
    resolvePlanetBBox,
    resolvePlanetDate,
    selectPlanetItem,
} from '@/lib/planet';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
    const { apiKey, itemType, lookbackDays, maxCloudCover } = getPlanetConfig();
    if (!apiKey) {
        return NextResponse.json(
            {
                mode: 'fallback',
                tileUrl: null,
                fallback: true,
                message: 'Planet SkySat API key is not configured (PLANET_API_KEY)',
            },
            {
                status: 503,
                headers: { 'Cache-Control': 'no-store' },
            }
        );
    }

    const { searchParams } = new URL(request.url);
    const date = resolvePlanetDate(searchParams.get('date'));
    const bbox = resolvePlanetBBox(searchParams.get('bbox'));

    try {
        const quickSearchResponse = await fetch('https://api.planet.com/data/v1/quick-search?_page_size=8&_sort=acquired%20desc', {
            method: 'POST',
            headers: {
                Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify(buildPlanetQuickSearchBody(bbox, date, { lookbackDays, maxCloudCover })),
            cache: 'no-store',
        });

        const payload = await quickSearchResponse.json().catch(() => null) as {
            features?: Array<{
                id: string;
                geometry?: { type?: string; coordinates?: unknown };
                properties?: {
                    acquired?: string;
                    published?: string;
                    cloud_cover?: number;
                    gsd?: number;
                    quality_category?: string;
                };
            }>;
            message?: string;
        } | null;

        if (!quickSearchResponse.ok) {
            return NextResponse.json(
                {
                    error: payload?.message ?? `Planet quick-search failed: ${quickSearchResponse.status}`,
                },
                {
                    status: quickSearchResponse.status,
                    headers: { 'Cache-Control': 'no-store' },
                }
            );
        }

        const selectedItem = selectPlanetItem(payload?.features ?? []);
        if (!selectedItem) {
            return NextResponse.json(
                {
                    error: 'Planet SkySat scene not found for the current area and date. Zoom in or pick another date.',
                },
                {
                    status: 404,
                    headers: { 'Cache-Control': 'no-store' },
                }
            );
        }

        return NextResponse.json(
            {
                mode: 'tile',
                provider: 'planet-skysat',
                tileUrl: `/api/satellite/planet/tiles/${encodeURIComponent(selectedItem.id)}/{z}/{x}/{y}`,
                itemType,
                itemId: selectedItem.id,
                date: selectedItem.acquired ?? date,
                requestedDate: date,
                cloudCover: selectedItem.cloudCover,
                gsd: selectedItem.gsd,
                qualityCategory: selectedItem.qualityCategory,
                coverageBbox: selectedItem.coverageBbox,
                fallback: false,
            },
            {
                headers: { 'Cache-Control': 'no-store' },
            }
        );
    } catch (error) {
        console.error('[Planet SkySat Route Error]', error);
        return NextResponse.json(
            {
                error: 'Planet SkySat metadata fetch failed',
            },
            {
                status: 500,
                headers: { 'Cache-Control': 'no-store' },
            }
        );
    }
}
