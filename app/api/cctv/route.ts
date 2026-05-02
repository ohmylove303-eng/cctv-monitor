import { NextResponse } from 'next/server';
import { normalizeCctvData } from '@/utils/coordinateAdapter';
import { gimpoCctv } from '@/data/cctv-gimpo';
import { incheonCctv } from '@/data/cctv-incheon';
import { applyOfficialCoordinateOverrides } from '@/lib/official-coordinates';
import { fetchGimpoItsCctv } from '@/lib/gimpo-its';
import { fetchIncheonUticCctv } from '@/lib/incheon-utic';
import { buildNationalItsDedupKey } from '@/lib/national-its';
import { applyCctvVisionCalibrations } from '@/lib/cctv-vision-calibration';
import type { CctvItem, CctvRegion, CctvType } from '@/types/cctv';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Vercel ISR: 60초마다 재생성하여 ITS API 호출수를 획기적으로 줄이고 Rate Limit 방지
export const revalidate = 60;

const REGION_ORDER: Record<CctvRegion, number> = {
    김포: 0,
    인천: 1,
    서울: 2,
};

const TYPE_ORDER: Record<CctvType, number> = {
    crime: 0,
    fire: 1,
    traffic: 2,
};

function buildRegionalLocalCctv(options?: { excludeTrafficRegions?: CctvRegion[] }): CctvItem[] {
    const excludedTrafficRegions = new Set(options?.excludeTrafficRegions ?? []);
    const localCctv = [...gimpoCctv, ...incheonCctv]
        .filter((item) => !(item.type === 'traffic' && excludedTrafficRegions.has(item.region)))
        .map((item) => ({
            ...item,
            source: item.source ?? (
                item.type === 'traffic'
                    ? (item.region === '김포' ? 'Gimpo-Local-Traffic' : 'Incheon-Local-Traffic')
                    : (item.region === '김포' ? 'Gimpo-Local' : 'Incheon-Local')
            ),
            coordinateSource: 'seed' as const,
            coordinateVerified: false,
            coordinateNote: '시드/주소 기반 근사 좌표',
        }));

    return Array.from(
        new Map(
            localCctv.map((item) => [item.id, item])
        ).values()
    );
}

function sortCctv(items: CctvItem[]) {
    return [...items].sort((a, b) =>
        REGION_ORDER[a.region] - REGION_ORDER[b.region]
        || TYPE_ORDER[a.type] - TYPE_ORDER[b.type]
        || a.name.localeCompare(b.name, 'ko')
    );
}

export async function GET() {
    try {
        let regionalLocalCctv = buildRegionalLocalCctv();
        let gimpoOfficialTraffic: CctvItem[] = [];
        let incheonOfficialTraffic: CctvItem[] = [];
        const apiKey = process.env.ITS_API_KEY;

        try {
            gimpoOfficialTraffic = await fetchGimpoItsCctv('all');
        } catch (gimpoError) {
            console.error('[Gimpo ITS] Official traffic fetch failed, fallback to local seeds:', gimpoError);
        }

        try {
            incheonOfficialTraffic = await fetchIncheonUticCctv();
        } catch (incheonError) {
            console.error('[Incheon UTIC] Official traffic fetch failed, fallback to local seeds:', incheonError);
        }

        const excludeTrafficRegions: CctvRegion[] = [];
        if (gimpoOfficialTraffic.length > 0) {
            excludeTrafficRegions.push('김포');
        }
        if (incheonOfficialTraffic.length > 0) {
            excludeTrafficRegions.push('인천');
        }
        if (excludeTrafficRegions.length > 0) {
            regionalLocalCctv = buildRegionalLocalCctv({ excludeTrafficRegions });
        }

        // 김포/인천 일대 Bounding Box (좀 더 타이트하게 조정)
        const minX = 126.3500;
        const maxX = 126.7900;
        const minY = 37.3500;
        const maxY = 37.8500;

        if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
            return NextResponse.json(
                { error: 'ITS_API_KEY 환경변수가 설정되지 않았습니다.' },
                { status: 503 }
            );
        }

        // 국가교통정보센터 (ITS) OpenAPI 규격 적용 (JSON 타입 요청)
        // [GREEN-ROUTE FIX] cctvType=4를 요청하여 HTTPS/HLS 지원 가능한 실시간 스트림(m3u8) 주소를 받아옵니다.
        const url = `https://openapi.its.go.kr:9443/cctvInfo?apiKey=${apiKey}&type=all&cctvType=4&minX=${minX}&maxX=${maxX}&minY=${minY}&maxY=${maxY}&getType=json`;

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

        // 상세 로깅: 데이터 구조 확인을 위해 콘솔에 출력 (디버깅용)
        console.log('[ITS API] Raw Data Response Keys:', Object.keys(data));

        // 응답 구조 확인 (국가교통정보센터 JSON 규격: response.data[].* 또는 response.coordInsttDeta[].*)
        let cctvList = [];
        if (data.response?.data && Array.isArray(data.response.data)) {
            cctvList = data.response.data;
        } else if (data.response?.coordInsttDeta && Array.isArray(data.response.coordInsttDeta)) {
            cctvList = data.response.coordInsttDeta;
        } else if (Array.isArray(data.list)) {
            cctvList = data.list;
        } else if (Array.isArray(data)) {
            cctvList = data;
        }

        // 디버깅: 첫 번째 데이터 샘플 출력
        if (cctvList.length > 0) {
            console.log('[ITS API] Sample Item Fields:', Object.keys(cctvList[0]));
        }

        const uniqueList = Array.from(
            new Map(
                cctvList.map((item: Record<string, unknown>) => {
                    const key = buildNationalItsDedupKey(item);
                    return [key, item];
                })
            ).values()
        );

        // normalizeCctvData를 사용하여 TM -> WGS84 변환 및 스키마 정규화 처리
        const normalized = normalizeCctvData(uniqueList);
        const mergedCandidate = [...regionalLocalCctv, ...gimpoOfficialTraffic, ...incheonOfficialTraffic, ...normalized];
        const { items: mergedWithOverrides, summary: overrideSummary } = await applyOfficialCoordinateOverrides(mergedCandidate);
        const { items: mergedWithVisionCalibration, summary: visionCalibrationSummary } = await applyCctvVisionCalibrations(mergedWithOverrides);
        const merged = sortCctv(mergedWithVisionCalibration);

        console.log(
            `[ITS API] Successfully fetched ${cctvList.length} items, normalized to ${normalized.length} ITS traffic CCTVs. local=${regionalLocalCctv.length} gimpoOfficial=${gimpoOfficialTraffic.length} incheonOfficial=${incheonOfficialTraffic.length} merged=${merged.length} officialOverrides=${overrideSummary.appliedOverrides}/${overrideSummary.totalOverrides} visionCalibrations=${visionCalibrationSummary.appliedCalibrations}/${visionCalibrationSummary.totalCalibrations}`
        );
        return NextResponse.json(merged, {
            headers: {
                'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
            },
        });

    } catch (error) {
        console.error('[ITS API] Fetch Error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
