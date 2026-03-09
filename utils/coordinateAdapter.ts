import proj4 from 'proj4';
import { CctvItem } from '@/types/cctv';

// ITS 좌표계 (EPSG:5181 또는 2097 등 프로젝트에 따른 한국 중부원점 TM 명시)
const KOREA_TM = '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 +ellps=GRS80 +units=m +no_defs';
const WGS84 = 'EPSG:4326';

export function normalizeCctvData(rawList: any[]): CctvItem[] {
    return rawList.map((item, index) => {
        // 1. ITS 좌표계 처리 로직 (TM -> WGS84 변환)
        let lat = item.lat || Number(item.coordy || item.latitude);
        let lng = item.lng || Number(item.coordx || item.longitude);

        // x/y 좌표값이 위경도 체계가 아닐 때만(예: 1000 이상) 변환 적용
        if (lat > 1000 || lng > 1000) {
            if (item.coordx && item.coordy) {
                const [wgsLng, wgsLat] = proj4(KOREA_TM, WGS84, [Number(item.coordx), Number(item.coordy)]);
                lat = wgsLat;
                lng = wgsLng;
            }
        }

        // Mixed Content (HTTPS -> HTTP) 차단 해결을 위해 ITS M3U8 주소의 스킴을 강제로 https로 변환
        let secureStreamUrl = item.hlsUrl || item.cctvurl || item.streamUrl || null;
        if (secureStreamUrl && typeof secureStreamUrl === 'string' && secureStreamUrl.startsWith('http://')) {
            secureStreamUrl = secureStreamUrl.replace('http://', 'https://');
        }

        // 2. 범례 및 색상 동기화를 위해 type 강제 매핑 및 단일 표준 스키마화
        return {
            id: item.id || item.cctvId || item.cctvname || `cctv-${index}-${Math.random().toString(36).substr(2, 5)}`,
            name: item.name || item.cctvname || item.cctvNm || '알 수 없는 CCTV',
            lat,
            lng,
            type: item.type || (item.source === 'ITS' || item.cctvname?.includes('ITS') ? 'traffic' : 'crime'), // crime, fire, traffic
            status: item.status || '정상',
            hlsUrl: secureStreamUrl,
            streamUrl: secureStreamUrl, // streamUrl fallback if needed by frontend
            source: item.source || (item.cctvurl ? 'National-ITS' : 'Unknown'),
            region: item.region || (item.cctvname?.includes('인천') ? '인천' : (item.cctvname?.includes('김포') ? '김포' : '고속국도')),
        };
    }).filter((c) => !isNaN(c.lat) && !isNaN(c.lng));
}
