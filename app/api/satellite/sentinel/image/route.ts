import { NextResponse } from 'next/server';
import {
    buildSentinelProcessPayload,
    getSentinelConfig,
    resolveSentinelBBox,
    resolveSentinelDate,
    resolveSentinelOutputSize,
} from '@/lib/sentinel';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function getAccessToken(clientId: string, clientSecret: string) {
    const tokenResponse = await fetch('https://services.sentinel-hub.com/oauth/token', {
        method: 'POST',
        headers: {
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
        }),
        cache: 'no-store',
    });

    if (!tokenResponse.ok) {
        throw new Error(`Sentinel token request failed: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json() as { access_token?: string };
    if (!tokenData.access_token) {
        throw new Error('Sentinel token missing access_token');
    }

    return tokenData.access_token;
}

export async function GET(request: Request) {
    const { clientId, clientSecret } = getSentinelConfig();
    if (!clientId || !clientSecret) {
        return NextResponse.json(
            {
                error: 'Sentinel client credentials are not set',
            },
            {
                status: 503,
                headers: { 'Cache-Control': 'no-store' },
            }
        );
    }

    const { searchParams } = new URL(request.url);
    const date = resolveSentinelDate(searchParams.get('date'));
    const bbox = resolveSentinelBBox(searchParams.get('bbox'));
    const { width, height } = resolveSentinelOutputSize(searchParams.get('width'), searchParams.get('height'));

    try {
        const accessToken = await getAccessToken(clientId, clientSecret);
        const processResponse = await fetch('https://services.sentinel-hub.com/api/v1/process', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                Accept: 'image/png',
            },
            body: JSON.stringify(buildSentinelProcessPayload(date, { bbox, width, height })),
            cache: 'no-store',
        });

        if (!processResponse.ok) {
            const errorText = await processResponse.text();
            console.error('[Sentinel Image Error]', errorText);
            return NextResponse.json(
                {
                    error: `Sentinel process failed: ${processResponse.status}`,
                },
                {
                    status: processResponse.status,
                    headers: { 'Cache-Control': 'no-store' },
                }
            );
        }

        const contentType = processResponse.headers.get('content-type') || 'image/png';
        const imageBuffer = await processResponse.arrayBuffer();

        return new NextResponse(imageBuffer, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 's-maxage=1800, stale-while-revalidate=86400',
            },
        });
    } catch (error) {
        console.error('[Sentinel Image Route Error]', error);
        return NextResponse.json(
            {
                error: 'Sentinel image fetch failed',
            },
            {
                status: 500,
                headers: { 'Cache-Control': 'no-store' },
            }
        );
    }
}
