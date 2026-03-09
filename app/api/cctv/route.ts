import { NextResponse } from 'next/server';
import { normalizeCctvData } from '@/utils/coordinateAdapter';

// Vercel ISR: 60초마다 재생성하여 ITS API 호출수를 획기적으로 줄이고 Rate Limit 방지
export const revalidate = 60;

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
            // Next.js ISR 캐시 전략 적용 (60초 단위 최신화)
            next: { revalidate: 60 }
        } as any);

        if (!response.ok) {
            console.error(`[ITS API] HTTP Error: ${response.status} ${response.statusText}`);
            throw new Error('ITS API Error');
        }

        const data = await response.json();

        // 응답 구조 확인 (국가교통정보센터 JSON 규격: response.coordInsttDeta[].*)
        const cctvList = data.response?.coordInsttDeta || data.response?.data || data.list || [];

        // normalizeCctvData를 사용하여 TM -> WGS84 변환 및 스키마 정규화 처리
        const normalized = normalizeCctvData(cctvList);

        console.log(`[ITS API] Successfully fetched and normalized ${normalized.length} CCTVs.`);
        return NextResponse.json(normalized);

    } catch (error) {
        console.error('[ITS API] Fetch Error:', error);
        console.error('[ITS API] Fetch Error:', error);
        // 클라이언트에서 왜 실패하는지 명확히 알기 위해 에러 메시지 반환 (기존에는 빈 배열 반환하여 원인파악 불가)
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
