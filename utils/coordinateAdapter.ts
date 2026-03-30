import proj4 from 'proj4';
import { CctvItem, CctvRegion } from '@/types/cctv';

// [PRECISION FIX] 한국 표준 중부원점 (EPSG:2097 / EPSG:5181 혼용 대응)
// Bessel 타원체에서 WGS84로의 7파라미터 변환(towgs84)을 추가하여 300~400m 오차를 제거합니다.
const KOREA_TM = '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +units=m +no_defs +towgs84=-146.43,507.89,681.46,0,0,0,0';
const WGS84 = 'EPSG:4326';

const GIMPO_KEYWORDS = ['김포', '고촌', '사우', '풍무', '장기', '구래', '운양', '걸포', '북변', '감정', '대곶', '통진', '하성', '양촌', '월곶', '학운', '서김포'];
const INCHEON_KEYWORDS = ['인천', '남인천', '송도', '연수', '옥련', '학익', '부평', '계양', '청라', '검단', '남동', '서창', '장수', '문학', '주안', '가정', '효성', '영종', '공항신도시', '인천대교', '영종대교', '공항', '북청라'];
const SEOUL_BUCKET_KEYWORDS = ['서울', '서울문산', '금촌', '월롱', '산단', '내포', '군자', '시흥', '부천', '중동', '송내', '노오지', '동양동', '서운', '일신'];

function includesAny(text: string, keywords: string[]) {
    return keywords.some((keyword) => text.includes(keyword));
}

function inferItsRegion(name: string, lat: number, lng: number): CctvRegion {
    if (includesAny(name, GIMPO_KEYWORDS)) return '김포';
    if (includesAny(name, INCHEON_KEYWORDS)) return '인천';
    if (includesAny(name, SEOUL_BUCKET_KEYWORDS)) return '서울';

    if (lat >= 37.55 && lat <= 37.75 && lng >= 126.55 && lng <= 126.80) return '김포';
    if (lat >= 37.34 && lat <= 37.75 && lng >= 126.38 && lng <= 126.76) return '인천';
    return '서울';
}

export function normalizeCctvData(rawList: any[]): CctvItem[] {
    return rawList.map((item, index) => {
        // 1. ITS 좌표계 처리 로직 (TM -> WGS84 변환)
        let rawLat = Number(item.coordy || item.latitude || 0);
        let rawLng = Number(item.coordx || item.longitude || 0);

        let lat = rawLat;
        let lng = rawLng;

        // [CRITICAL] 경위도(WGS84)와 TM 좌표를 구분하는 기준 강화
        const isWGS84 = rawLat > 33 && rawLat < 43 && rawLng > 124 && rawLng < 132;
        const isTM = rawLat > 100000 || rawLng > 100000;

        if (isTM && !isWGS84) {
            if (rawLng && rawLat) {
                try {
                    // [PRECISION FIX] Bessel 타원체 오차 보정을 위한 Proj4 변환 실행
                    const [wgsLng, wgsLat] = proj4(KOREA_TM, WGS84, [rawLng, rawLat]);
                    lat = wgsLat;
                    lng = wgsLng;
                } catch (e) {
                    console.error('[CoordinateAdapter] Conversion failed for:', item.name, e);
                }
            }
        }

        // 2. Mixed Content (HTTPS -> HTTP) 차단 해결을 위해 ITS M3U8 주소의 스킴을 강제로 https로 변환
        // NOTE: 일부 ITS 서버는 HTTPS를 지원하지 않을 수 있어, 이 경우 브라우저가 차단할 수 있습니다.
        let rawUrl = item.hlsUrl || item.cctvurl || item.streamUrl || item.cctvUrl || '';
        let secureStreamUrl: string | null = null;

        if (typeof rawUrl === 'string' && rawUrl.length > 5) {
            // 주소가 http://vms.its.go.kr 등인 경우 https로 변환
            secureStreamUrl = rawUrl.replace(/^http:\/\//i, 'https://');

            // 만약 URL에 포트가 명시되어 있다면 (예: :8080), https에서는 동작하지 않을 확률이 높음
            // 하지만 대개 ITS는 80/443 표준을 사용함
        }

        // 3. 범례 및 색상 동기화를 위해 type 강제 매핑 및 단일 표준 스키마화
        const source = item.source || (item.cctvurl || item.cctvUrl ? 'National-ITS' : 'System');
        const name = item.name || item.cctvname || item.cctvNm || '알 수 없는 CCTV';

        // 안정적인 ID 생성 (이름 기반 해싱 또는 인코딩)
        // 앞서 app/page.tsx에서 중복 이름은 제거했으므로 이름이 고유 키 역할을 수행 가능함
        const safeIdName = encodeURIComponent(name).replace(/%/g, '');
        const cctvId = `CCTV-${safeIdName}-${index}`;

        const region = inferItsRegion(name, lat, lng);

        const type: CctvItem['type'] = 'traffic';
        const status: CctvItem['status'] = '정상';

        return {
            id: item.id || item.cctvId || cctvId,
            name,
            lat,
            lng,
            type, // ITS 데이터는 전량 교통(traffic) 캠
            status, // ITS API 응답에 포함된 것은 모두 정상 가동 스트림
            hlsUrl: secureStreamUrl || rawUrl || '',
            streamUrl: secureStreamUrl || rawUrl || '',
            source,
            coordinateSource: 'its_api' as const,
            coordinateVerified: true,
            region: region,
            operator: item.operator || 'National-ITS',
            district: item.district || region,
            address: item.address || name,
        };
    }).filter((c) => !isNaN(c.lat) && !isNaN(c.lng));
}
