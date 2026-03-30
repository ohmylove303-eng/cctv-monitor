import { NextResponse } from 'next/server';
import { hasGoogleMapsApiKey } from '@/lib/google-maps';
import { getPlanetConfig } from '@/lib/planet';
import { getSentinelConfig } from '@/lib/sentinel';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
    const planet = getPlanetConfig();
    const sentinel = getSentinelConfig();

    return NextResponse.json(
        {
            off: true,
            sentinel: Boolean(
                (sentinel.clientId && sentinel.clientSecret)
                || sentinel.instanceId
            ),
            planet: Boolean(planet.apiKey),
            google: hasGoogleMapsApiKey(),
        },
        {
            headers: { 'Cache-Control': 'no-store' },
        }
    );
}
