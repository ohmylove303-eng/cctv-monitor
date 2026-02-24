import { NextResponse } from 'next/server';

// 경기도 교통정보(KTICT) 공개 API
// 공식 문서 샘플키 사용 (https://openapigits.gg.go.kr)
const SAMPLE_KEY = '72c03919776b2db8e4dd25aaebc1ae7f37bcf49';
const BASE = 'https://openapigits.gg.go.kr/api/rest/getCctvKtictInfo';

/** HTML 엔티티 디코딩 */
function decodeHtmlEntities(str: string): string {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#xD;/g, '')
        .replace(/&#x[0-9A-Fa-f]+;/g, '')
        .replace(/&#\d+;/g, '');
}

/** XML 태그 추출 */
function extractTag(tag: string, block: string): string {
    const m = block.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`));
    return m ? m[1].trim() : '';
}

export async function GET() {
    const key = process.env.GG_CCTV_KEY || SAMPLE_KEY;

    try {
        const params = new URLSearchParams({
            serviceKey: key,
            g_cctvType: '2',
            g_MinX: '126.50',
            g_MaxX: '126.85',
            g_MinY: '37.50',
            g_MaxY: '37.75',
        });

        const res = await fetch(`${BASE}?${params}`, {
            cache: 'no-store',
        });

        if (!res.ok) {
            return NextResponse.json({ cameras: [], error: `API ${res.status}`, source: 'GG_KTICT' });
        }

        const rawText = await res.text();

        // 이중 인코딩: 외부 XML의 <msgBody> 내부에 HTML 엔티티로 인코딩된 XML이 들어있음
        // → msgBody 블록 추출 → HTML 엔티티 디코딩 → 내부 XML 파싱
        const bodyMatch = rawText.match(/<msgBody>([\s\S]*?)<\/msgBody>/);
        const innerXml = bodyMatch
            ? decodeHtmlEntities(bodyMatch[1])
            : decodeHtmlEntities(rawText);

        // <data> 블록들 파싱
        const blocks = innerXml.match(/<data>([\s\S]*?)<\/data>/g) ?? [];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cameras: any[] = blocks
            .map(block => {
                const lat = parseFloat(extractTag('coordy', block));
                const lng = parseFloat(extractTag('coordx', block));
                const url = extractTag('cctvurl', block);
                const name = extractTag('cctvname', block) || extractTag('cctvtitle', block) || '';
                if (!lat || !lng || !url) return null;
                return {
                    id: name || url.slice(-16),
                    name: name || `김포 교통 CCTV`,
                    address: name || '',
                    lat,
                    lng,
                    hlsUrl: url,               // MP4 or HLS URL from gitsview.gg.go.kr
                    format: extractTag('cctvformat', block) || 'MP4',
                    source: 'GG_KTICT',
                };
            })
            .filter((c): c is NonNullable<typeof c> => c !== null && c !== undefined)
            .filter((c) => c.lat > 37 && c.lng > 126);

        return NextResponse.json({
            success: cameras.length > 0,
            count: cameras.length,
            cameras,
            source: 'GG_KTICT',
            fetchedAt: new Date().toISOString(),
            // debug: rawText.slice(0, 500),  // 디버그 시 주석 해제
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
