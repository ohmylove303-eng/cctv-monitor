import { NextResponse } from 'next/server';
import { NormalizedCctv } from '@/app/types';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const apiKey = process.env.ITS_API_KEY || process.env.NEXT_PUBLIC_ITS_API_KEY;

        // 김포/인천 일대 Bounding Box (좀 더 타이트하게 조정)
        const minX = 126.3500;
        const maxX = 126.7900;
        const minY = 37.3500;
        const maxY = 37.8500;

        if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
            console.warn('[ITS API] API Key is missing. Returning empty array to seamlessly fallback to static data.');
            return NextResponse.json([]);
        }

        // 국가교통정보센터 (ITS) OpenAPI 규격 적용 (JSON 타입 요청)
        const url = `https://openapi.its.go.kr:9443/cctvInfo?apiKey=${apiKey}&type=all&cctvType=1&minX=${minX}&maxX=${maxX}&minY=${minY}&maxY=${maxY}&getType=json`;

        const response = await fetch(url, {
            headers: {
                // ITS API는 주로 별도의 헤더를 요구하지 않으나 브라우저 명시
                'User-Agent': 'Mozilla/5.0'
            },
            // 캐시를 타지 않도록 설정 (실시간 영상 링크 무결성 확보)
            cache: 'no-store'
        });

        if (!response.ok) {
            console.error(`[ITS API] HTTP Error: ${response.status} ${response.statusText}`);
            throw new Error('ITS API Error');
        }

        const data = await response.json();

        // 응답 구조 확인 (국가교통정보센터 JSON 규격: response.coordInsttDeta[].*)
        const cctvList = data.response?.coordInsttDeta || data.response?.data || data.list || [];

        const normalized: NormalizedCctv[] = cctvList.map((item: any) => {
            // 좌표 변환 (coordx, coordy)
            const lng = parseFloat(item.coordx || item.lng || item.longitude);
            const lat = parseFloat(item.coordy || item.lat || item.latitude);

            // Mixed Content (HTTPS -> HTTP) 차단 해결을 위해 ITS M3U8 주소의 스킴을 강제로 https로 변환
            let secureStreamUrl = item.cctvurl || item.streamUrl || null;
            if (secureStreamUrl && secureStreamUrl.startsWith('http://')) {
                secureStreamUrl = secureStreamUrl.replace('http://', 'https://');
            }

            return {
                id: item.cctvname || item.cctvId || Math.random().toString(36).substr(2, 9),
                name: item.cctvname || item.cctvNm || 'Unknown CCTV',
                region: item.cctvname?.includes('인천') ? '인천' : (item.cctvname?.includes('김포') ? '김포' : '고속국도'),
                status: 'online', // ITS API에서 내려오는 영상은 기본적으로 online 간주
                coordinates: [lng, lat, 30],
                streamUrl: secureStreamUrl,
                source: 'National-ITS'
            };
        }).filter((c: any) => !isNaN(c.coordinates[0]) && !isNaN(c.coordinates[1]) && c.streamUrl);

        console.log(`[ITS API] Successfully fetched and normalized ${normalized.length} CCTVs.`);
        return NextResponse.json(normalized);

    } catch (error) {
        console.error('[ITS API] Fetch Error:', error);
        // 폴백: 빈 배열 반환하여 대시보드 중단 방지 (page.tsx에서 원본 정적 데이터 사용)
        return NextResponse.json([]);
    }
}
