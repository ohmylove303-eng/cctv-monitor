export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function formatKmaDate(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
        d.getFullYear().toString() +
        pad(d.getMonth() + 1) +
        pad(d.getDate()) +
        pad(d.getHours()) +
        pad(d.getMinutes())
    );
}

export async function GET() {
    const apiKey = process.env.KMA_API_KEY;

    if (!apiKey) {
        return NextResponse.json({
            imageUrl: null,
            fallback: true,
            message: 'KMA_API_KEY not set',
            updatedAt: new Date().toISOString(),
        });
    }

    try {
        const now = new Date();
        const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000);

        const sDate = formatKmaDate(tenMinAgo);
        const eDate = formatKmaDate(now);

        const url =
            `https://apihub.kma.go.kr/api/typ05/api/GK2A/LE1B/VI005/FD/imageList` +
            `?sDate=${sDate}&eDate=${eDate}&authKey=${apiKey}`;

        const res = await fetch(url, { cache: 'no-store' });

        if (!res.ok) {
            return NextResponse.json({
                imageUrl: null,
                fallback: true,
                message: `KMA API returned ${res.status}`,
                updatedAt: new Date().toISOString(),
            });
        }

        const text = await res.text();
        let imageUrl: string | null = null;

        // KMA API 응답에서 이미지 URL 추출 (JSON 또는 텍스트 형식)
        try {
            const json = JSON.parse(text);
            // 응답 구조에 따라 URL 추출
            if (json.data && Array.isArray(json.data) && json.data.length > 0) {
                imageUrl = json.data[json.data.length - 1]?.imageUrl ?? null;
            } else if (json.imageUrl) {
                imageUrl = json.imageUrl;
            } else if (json.response?.body?.items?.item) {
                const items = json.response.body.items.item;
                const last = Array.isArray(items) ? items[items.length - 1] : items;
                imageUrl = last?.imageUrl ?? null;
            }
        } catch {
            // 텍스트 응답에서 URL 패턴 추출
            const match = text.match(/https?:\/\/[^\s"'<>]+\.(?:png|jpg|gif|jpeg)/i);
            if (match) imageUrl = match[0];
        }

        return NextResponse.json({
            imageUrl,
            updatedAt: new Date().toISOString(),
            fallback: imageUrl === null,
        });
    } catch (err) {
        console.error('[GK2A API Error]', err);
        return NextResponse.json({
            imageUrl: null,
            fallback: true,
            message: 'Fetch failed',
            updatedAt: new Date().toISOString(),
        });
    }
}
