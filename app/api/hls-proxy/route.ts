import http from 'node:http';
import https from 'node:https';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const GIMPO_BASE = 'https://gimpo.cctvstream.net:8443';
const REFERER = 'https://its.gimpo.go.kr/';
const KTICT_HOST = 'cctvsec.ktict.co.kr';
const FITIC_HOST = 'cctv.fitic.go.kr';
const ALLOWED_HOSTS = new Set(['gimpo.cctvstream.net', 'gitsview.gg.go.kr', KTICT_HOST, FITIC_HOST]);

function decodeProxyTarget(value: string): string {
    return Buffer.from(value.replace(/ /g, '+'), 'base64').toString('utf8');
}

function encodeProxyTarget(value: string): string {
    return encodeURIComponent(Buffer.from(value, 'utf8').toString('base64'));
}

function isAllowedProxyUrl(url: string): boolean {
    try {
        const target = new URL(url);
        return (target.protocol === 'https:' || target.protocol === 'http:') && ALLOWED_HOSTS.has(target.hostname);
    } catch {
        return false;
    }
}

function normalizeHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
    return Object.fromEntries(
        Object.entries(headers).flatMap(([key, value]) => {
            if (Array.isArray(value)) return [[key, value.join(', ')]];
            if (typeof value === 'string') return [[key, value]];
            return [];
        })
    );
}

async function fetchKtict(url: string, headers: Record<string, string>, redirects = 0): Promise<{
    status: number;
    body: Buffer;
    headers: Record<string, string>;
    finalUrl: string;
}> {
    if (redirects > 4) {
        throw new Error('KTICT redirect loop');
    }

    return new Promise((resolve, reject) => {
        const target = new URL(url);
        const requester = target.protocol === 'http:' ? http : https;
        const requestOptions =
            target.protocol === 'https:'
                ? {
                    headers,
                    rejectUnauthorized: false,
                }
                : { headers };

        const req = requester.request(target, requestOptions, (res) => {
            const status = res.statusCode ?? 502;

            if (status >= 300 && status < 400 && res.headers.location) {
                const redirectUrl = new URL(res.headers.location, url).toString();
                res.resume();
                fetchKtict(redirectUrl, headers, redirects + 1).then(resolve).catch(reject);
                return;
            }

            const chunks: Buffer[] = [];
            res.on('data', (chunk) => {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            });
            res.on('end', () => {
                resolve({
                    status,
                    body: Buffer.concat(chunks),
                    headers: normalizeHeaders(res.headers),
                    finalUrl: url,
                });
            });
        });

        req.on('error', reject);
        req.end();
    });
}

async function fetchUpstream(url: string, headers: Record<string, string> = {}) {
    const target = new URL(url);

    if (target.hostname === KTICT_HOST) {
        return fetchKtict(url, {
            'User-Agent': 'Mozilla/5.0',
            ...headers,
        });
    }

    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0',
            ...headers,
        },
        cache: 'no-store',
    });

    return {
        status: res.status,
        body: Buffer.from(await res.arrayBuffer()),
        headers: Object.fromEntries(res.headers.entries()),
        finalUrl: res.url || url,
    };
}

function rewritePlaylist(text: string, upstreamUrl: string): string {
    return text
        .split('\n')
        .map((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return line;

            const absoluteUrl = new URL(trimmed, upstreamUrl).toString();
            const query = /\.m3u8(?:\?|$)/i.test(absoluteUrl) ? 'playlist' : 'seg';
            return `/api/hls-proxy?${query}=${encodeProxyTarget(absoluteUrl)}`;
        })
        .join('\n');
}

function toBodyInit(buffer: Buffer): ArrayBuffer {
    return Uint8Array.from(buffer).buffer;
}

async function proxyPlaylist(url: string, headers: Record<string, string> = {}) {
    if (!isAllowedProxyUrl(url)) {
        return new NextResponse('invalid playlist url', { status: 400 });
    }

    const upstream = await fetchUpstream(url, headers);
    if (upstream.status >= 400) {
        return new NextResponse(null, { status: upstream.status });
    }

    const rewritten = rewritePlaylist(upstream.body.toString('utf8'), upstream.finalUrl);
    return new NextResponse(rewritten, {
        headers: {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Access-Control-Allow-Origin': '*',
        },
    });
}

// /api/hls-proxy?channel=c001     → m3u8 반환 (세그먼트 URL을 프록시로 재작성)
// /api/hls-proxy?playlist=BASE64_URL → 임의 HLS playlist 재작성 프록시
// /api/hls-proxy?seg=BASE64_URL   → .ts 세그먼트 파이프
// /api/hls-proxy?mp4=BASE64_URL   → gitsview.gg.go.kr MP4 파이프 (경기도 KTICT)
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const channel = searchParams.get('channel');
    const playlistB64 = searchParams.get('playlist');
    const segB64 = searchParams.get('seg');
    const mp4B64 = searchParams.get('mp4');

    // ── 경기도 GG KTICT MP4 프록시 ──────────────────────────────────────────
    if (mp4B64) {
        const mp4Url = decodeProxyTarget(mp4B64);
        if (!isAllowedProxyUrl(mp4Url) || (mp4Url.includes(KTICT_HOST) && !mp4Url.endsWith('.mp4'))) {
            return new NextResponse('invalid mp4 url', { status: 400 });
        }
        try {
            const upstream = await fetchUpstream(mp4Url);
            if (upstream.status >= 400) return new NextResponse(null, { status: upstream.status });
            return new NextResponse(toBodyInit(upstream.body), {
                headers: {
                    'Content-Type': upstream.headers['content-type'] || 'video/mp4',
                    'Cache-Control': 'no-store, no-cache, must-revalidate',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        } catch {
            return new NextResponse('mp4 fetch failed', { status: 502 });
        }
    }

    // ── Gimpo ITS .ts 세그먼트 프록시 ─────────────────────────────────────────
    if (segB64) {
        const segUrl = decodeProxyTarget(segB64);
        if (!isAllowedProxyUrl(segUrl)) {
            return new NextResponse('invalid segment url', { status: 400 });
        }
        try {
            const upstreamHeaders: Record<string, string> = segUrl.startsWith(GIMPO_BASE)
                ? { Referer: REFERER, Origin: 'https://its.gimpo.go.kr' }
                : {};
            const upstream = await fetchUpstream(segUrl, upstreamHeaders);
            if (upstream.status >= 400) return new NextResponse(null, { status: upstream.status });
            return new NextResponse(toBodyInit(upstream.body), {
                headers: {
                    'Content-Type': upstream.headers['content-type'] || 'video/MP2T',
                    'Cache-Control': 'no-store, no-cache, must-revalidate',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        } catch {
            return new NextResponse('segment fetch failed', { status: 502 });
        }
    }

    if (playlistB64) {
        try {
            return await proxyPlaylist(decodeProxyTarget(playlistB64));
        } catch (err) {
            return NextResponse.json({ error: String(err) }, { status: 502 });
        }
    }

    // ── Gimpo ITS m3u8 매니페스트 프록시 ──────────────────────────────────────
    if (!channel || !/^c\d{3,4}$/.test(channel)) {
        return NextResponse.json({ error: 'channel 또는 playlist 파라미터 필요' }, { status: 400 });
    }

    const playlistUrl = `${GIMPO_BASE}/${channel}/1080p.m3u8`;
    try {
        return await proxyPlaylist(playlistUrl, { Referer: REFERER, Origin: 'https://its.gimpo.go.kr' });
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 502 });
    }
}
