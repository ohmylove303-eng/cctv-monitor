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
            g_cctvType: '2',      // 2 = MP4/HLS 동영상
            g_MinX: '126.50',
            g_MaxX: '126.85',
            g_MinY: '37.50',
            g_MaxY: '37.75',      // 김포시 좌표 범위
        });

        const res = await fetch(`${BASE}?${params}`, {
            next: { revalidate: 300 },
        });

        if (!res.ok) {
            return NextResponse.json({ cameras: [], error: `API ${res.status}`, source: 'GG_KTICT' }, { status: 200 });
        }

        const data = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items: any[] = data?.body?.items?.item ?? data?.response?.body?.items?.item ?? [];
        const list = Array.isArray(items) ? items : [items];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cameras = list.filter(c => c?.coordy && c?.coordx).map((c: any) => {
            const hlsUrl: string = (c.cctvurl ?? '').trim();
            return {
                id: c.cctvname ?? c.cctvid ?? '',
                name: c.cctvname ?? '',
                address: c.cctvname ?? '',
                lat: parseFloat(c.coordy),
                lng: parseFloat(c.coordx),
                hlsUrl,
                format: c.cctvformat ?? 'HLS',
                source: 'GG_KTICT',
            };
        }).filter(c => c.lat > 37 && c.lng > 126);

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
        }, { status: 200 });
    }
}
