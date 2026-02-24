import { NextResponse } from 'next/server';

// 경기도 교통정보(KTICT) 공개 API
// 공식 문서 샘플키 사용 (https://openapigits.gg.go.kr)
const SAMPLE_KEY = '72c03919776b2db8e4dd25aaebc1ae7f37bcf49';
const BASE = 'https://openapigits.gg.go.kr/api/rest/getCctvKtictInfo';

export async function GET() {
    const key = process.env.GG_CCTV_KEY || SAMPLE_KEY;

    try {
        const params = new URLSearchParams({
            serviceKey: key,
            type: 'json',
            getType: 'json',
            g_cctvType: '2',      // 2 = MP4/HLS 동영상
            g_MinX: '126.50',
            g_MaxX: '126.85',
            g_MinY: '37.50',
            g_MaxY: '37.75',  // 김포시 좌표 범위
        });

        const res = await fetch(`${BASE}?${params}`, {
            headers: { Accept: 'application/json, */*' },
            next: { revalidate: 300 },
        });

        if (!res.ok) {
            return NextResponse.json({ cameras: [], error: `API ${res.status}`, source: 'GG_KTICT' });
        }

        const text = await res.text();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let items: any[] = [];

        if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
            // ─ JSON 응답 ─
            const data = JSON.parse(text);
            const raw = data?.body?.items?.item ?? data?.response?.body?.items?.item ?? [];
            items = Array.isArray(raw) ? raw : [raw];

        } else if (text.includes('<item>')) {
            // ─ XML 응답 — 정규식 파싱 ─
            const extract = (tag: string, block: string) => {
                const m = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
                return m ? m[1].trim() : '';
            };
            const blocks = text.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
            items = blocks.map(block => ({
                cctvname: extract('cctvname', block),
                cctvurl: extract('cctvurl', block),
                cctvformat: extract('cctvformat', block),
                coordy: extract('coordy', block),
                coordx: extract('coordx', block),
            }));

        } else {
            // ─ 예상 외 응답 ─
            return NextResponse.json({
                cameras: [], source: 'GG_KTICT',
                error: 'Unexpected API response: ' + text.slice(0, 300),
            });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cameras = items.filter((c: any) => c?.coordy && c?.coordx).map((c: any) => ({
            id: c.cctvname ?? c.cctvid ?? '',
            name: c.cctvname ?? '',
            address: c.cctvname ?? '',
            lat: parseFloat(c.coordy),
            lng: parseFloat(c.coordx),
            hlsUrl: (c.cctvurl ?? '').trim(),
            format: c.cctvformat ?? 'HLS',
            source: 'GG_KTICT',
        })).filter((c: { lat: number; lng: number }) => c.lat > 37 && c.lng > 126);

        return NextResponse.json({
            success: true,
            count: cameras.length,
            cameras,
            source: 'GG_KTICT',
            fetchedAt: new Date().toISOString(),
        });

    } catch (err) {
        return NextResponse.json({
            success: false,
            error: String(err),
            cameras: [],
            source: 'GG_KTICT',
        });
    }
}
