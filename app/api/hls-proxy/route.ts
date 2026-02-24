import { NextRequest, NextResponse } from 'next/server';

const GIMPO_BASE = 'https://gimpo.cctvstream.net:8443';
const REFERER = 'https://its.gimpo.go.kr/';

// /api/hls-proxy?channel=c001     → m3u8 반환 (세그먼트 URL을 프록시로 재작성)
// /api/hls-proxy?seg=BASE64_URL   → .ts 세그먼트 파이프
// /api/hls-proxy?mp4=BASE64_URL   → gitsview.gg.go.kr MP4 파이프 (경기도 KTICT)
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const channel = searchParams.get('channel');
    const segB64 = searchParams.get('seg');
    const mp4B64 = searchParams.get('mp4');

    // ── 경기도 GG KTICT MP4 프록시 ──────────────────────────────────────────
    if (mp4B64) {
        const mp4Url = Buffer.from(mp4B64, 'base64').toString('utf8');
        if (!mp4Url.includes('gitsview.gg.go.kr') && !mp4Url.startsWith(GIMPO_BASE)) {
            return new NextResponse('invalid mp4 url', { status: 400 });
        }
        try {
            const res = await fetch(mp4Url, { cache: 'no-store' });
            if (!res.ok) return new NextResponse(null, { status: res.status });
            return new NextResponse(res.body, {
                headers: {
                    'Content-Type': res.headers.get('Content-Type') || 'video/mp4',
                    'Cache-Control': 'no-cache',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        } catch {
            return new NextResponse('mp4 fetch failed', { status: 502 });
        }
    }

    // ── Gimpo ITS .ts 세그먼트 프록시 ─────────────────────────────────────────
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

    // ── Gimpo ITS m3u8 매니페스트 프록시 ──────────────────────────────────────
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
        const baseUrl = `${GIMPO_BASE}/${channel}/`;
        const rewritten = text.split('\n').map(line => {
            const t = line.trim();
            if (!t || t.startsWith('#')) return line;
            const absUrl = t.startsWith('http') ? t : baseUrl + t;
            const encoded = Buffer.from(absUrl).toString('base64');
            return `/api/hls-proxy?seg=${encoded}`;
        }).join('\n');

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
