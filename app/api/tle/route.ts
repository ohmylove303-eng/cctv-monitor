import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const response = await fetch(
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle',
            { next: { revalidate: 3600 } }
        );

        if (!response.ok) throw new Error('Failed to fetch TLE');

        const text = await response.text();
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const tles = [];

        for (let i = 0; i < lines.length - 2; i += 3) {
            tles.push({
                name: lines[i],
                line1: lines[i + 1],
                line2: lines[i + 2]
            });
            if (tles.length >= 500) break;
        }

        return NextResponse.json(tles);
    } catch (error) {
        console.error('TLE Fetch Error:', error);
        return NextResponse.json([]);
    }
}
