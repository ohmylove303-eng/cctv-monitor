import { NextResponse } from 'next/server';

// ─── Gimpo ITS 내부 API 프록시 ─────────────────────────────────────────────
// its.gimpo.go.kr 내부 API를 서버사이드에서 호출하여 CORS/Mixed Content 우회
// 브라우저에서 직접 호출 불가능한 엔드포인트를 Next.js API Route가 중계

const ITS_BASE = 'https://its.gimpo.go.kr';

const ENDPOINTS = {
    main: '/traf/selectMainCCTVList.do',       // 일반 교통 CCTV 63개
    cross: '/traf/selectCrossCmrinfo.do',        // 스마트교차로 CCTV 133개
    incident: '/traf/selectincdentCCTV.do',         // 사고 관련 CCTV
};

const commonHeaders = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Referer': 'https://its.gimpo.go.kr/traf/main.do',
    'User-Agent': 'Mozilla/5.0 (compatible; CCTV-Monitor/2.0)',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
};

async function fetchITS(endpoint: string, body = '') {
    const res = await fetch(ITS_BASE + endpoint, {
        method: 'POST',
        headers: commonHeaders,
        body,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        next: { revalidate: 30 } as any,  // 30초 캐시
    });
    if (!res.ok) throw new Error(`ITS API error: ${res.status}`);
    return res.json();
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') ?? 'all';

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let data: any[] = [];

        if (type === 'main' || type === 'all') {
            const main = await fetchITS(ENDPOINTS.main, 'levl=4');
            const list = Array.isArray(main) ? main : (main.list ?? main.data ?? []);
            data.push(...list.map((c: Record<string, unknown>) => ({
                id: c.CTLR_ID ?? c.ctlrId ?? '',
                name: c.LOC_NAME ?? c.locNm ?? '',
                address: c.LOC_ADDR ?? c.locAddr ?? '',
                lat: parseFloat(String(c.Y_CRDN ?? c.yCrdn ?? 0)),
                lng: parseFloat(String(c.X_CRDN ?? c.xCrdn ?? 0)),
                hlsUrl: c.STRM_HTTP_ADDR ?? c.strmHttpAddr ?? '',
                rtspUrl: c.STRM_RTSP_ADDR ?? c.strmRtspAddr ?? '',
                type: 'traffic',
                source: 'gimpo-its-main',
            })));
        }

        if (type === 'cross' || type === 'all') {
            const cross = await fetchITS(ENDPOINTS.cross);
            const list = Array.isArray(cross) ? cross : (cross.list ?? cross.data ?? []);
            data.push(...list.map((c: Record<string, unknown>) => ({
                id: c.CMRA_ID ?? c.cmraId ?? '',
                name: c.INSL_LOC ?? c.inslLoc ?? '',
                address: c.INSL_ADDR ?? c.inslAddr ?? '',
                lat: parseFloat(String(c.LAT ?? c.lat ?? 0)),
                lng: parseFloat(String(c.LON ?? c.lng ?? 0)),
                hlsUrl: c.STRM_URL ?? c.strmUrl ?? c.HLS_URL ?? '',
                rtspUrl: '',
                type: 'traffic',
                source: 'gimpo-its-cross',
            })));
        }

        // 유효 좌표만 필터링
        data = data.filter(c => c.lat > 37 && c.lng > 126 && c.id);

        return NextResponse.json({
            success: true,
            count: data.length,
            cameras: data,
            fetchedAt: new Date().toISOString(),
        });

    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[gimpo-cctv]', msg);
        return NextResponse.json(
            { success: false, error: msg, cameras: [] },
            { status: 502 }
        );
    }
}
