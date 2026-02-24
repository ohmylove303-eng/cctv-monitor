import { NextRequest, NextResponse } from 'next/server';

const GIMPO_BASE = 'https://gimpo.cctvstream.net:8443';
const REFERER = 'https://its.gimpo.go.kr/';

// ── m3u8 매니페스트 프록시 ──────────────────────────────────────────────────
// /api/hls-proxy?channel=c001          → m3u8 반환 (세그먼트 URL을 /api/hls-proxy?seg=... 로 재작성)
// /api/hls-proxy?seg=BASE64_URL        → .ts 세그먼트 파이프
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const channel = searchParams.get('channel');  // e.g. c001
    const segB64 = searchParams.get('seg');      // base64 segment URL

    // ── 세그먼트 프록시 ────────────────────────────────────────────────────────
    if (segB64) {
        const segUrl = Buffer.from(segB64, 'base64').toString('utf8');
        if (!segUrl.startsWith(GIMPO_BASE)) {
            return new NextResponse('invalid segment url', { status: 400 });
        }
        try {
            const res = await fetch(segUrl, {
                headers: { Referer: REFERER, Origin: 'https://its.gimpo.go.kr' },
            });
            if (!res.ok) return new NextResponse(null, { status: res.status });

            return new NextResponse(res.body, {
                headers: {
                    'Content-Type': 'video/MP2T',
                    'Cache-Control': 'no-cache',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        } catch {
            return new NextResponse('segment fetch failed', { status: 502 });
        }
    }

    // ── m3u8 매니페스트 프록시 ─────────────────────────────────────────────────
    if (!channel || !/^c\d{3,4}$/.test(channel)) {
        return NextResponse.json({ error: 'channel 파라미터 필요 (예: c001)' }, { status: 400 });
    }

    const m3u8Url = `${GIMPO_BASE}/${channel}/1080p.m3u8`;

    try {
        const res = await fetch(m3u8Url, {
            headers: { Referer: REFERER, Origin: 'https://its.gimpo.go.kr' },
            cache: 'no-store',
        });

        if (!res.ok) {
            return NextResponse.json({ error: `upstream ${res.status}` }, { status: res.status });
        }

        const text = await res.text();

        // 세그먼트 URL 재작성: 상대 경로 .ts → /api/hls-proxy?seg=BASE64
        const baseUrl = `${GIMPO_BASE}/${channel}/`;
        const rewritten = text
            .split('\n')
            .map(line => {
                const t = line.trim();
                if (!t || t.startsWith('#')) return line;
                const absUrl = t.startsWith('http') ? t : baseUrl + t;
                const encoded = Buffer.from(absUrl).toString('base64');
                return `/api/hls-proxy?seg=${encoded}`;
            })
            .join('\n');

        return new NextResponse(rewritten, {
            headers: {
                'Content-Type': 'application/vnd.apple.mpegurl',
                'Cache-Control': 'no-cache, no-store',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 502 });
    }
}
