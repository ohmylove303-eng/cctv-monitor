import type { CctvItem } from '@/types/cctv';

const ITS_BASE = 'https://its.gimpo.go.kr';

const ENDPOINTS = {
    main: '/traf/selectMainCCTVList.do',
    cross: '/traf/selectCrossCmrinfo.do',
} as const;

const DISTRICT_PATTERN = /(고촌읍|양촌읍|통진읍|월곶면|대곶면|하성면|사우동|풍무동|장기동|운양동|구래동|마산동|걸포동|북변동|감정동)/;

const commonHeaders = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    Referer: 'https://its.gimpo.go.kr/cctv.view',
    'User-Agent': 'Mozilla/5.0 (compatible; CCTV-Monitor/2.1)',
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
};

type GimpoItsApiRecord = Record<string, unknown>;

function inferDistrict(name: string, address: string) {
    const matched = address.match(DISTRICT_PATTERN)?.[1] ?? name.match(DISTRICT_PATTERN)?.[1];
    return matched ?? '김포';
}

async function fetchITS(endpoint: string, body = '') {
    const response = await fetch(`${ITS_BASE}${endpoint}`, {
        method: 'POST',
        headers: commonHeaders,
        body,
        next: { revalidate: 30 } as any,
    });

    if (!response.ok) {
        throw new Error(`Gimpo ITS API error: ${response.status}`);
    }

    return response.json();
}

function normalizeMainCamera(record: GimpoItsApiRecord): CctvItem | null {
    const id = String(record.CTLR_ID ?? record.ctlrId ?? '').trim();
    const name = String(record.LOC_NAME ?? record.locNm ?? '').trim();
    const address = String(record.LOC_ADDR ?? record.locAddr ?? '').trim();
    const lat = Number(record.Y_CRDN ?? record.yCrdn ?? Number.NaN);
    const lng = Number(record.X_CRDN ?? record.xCrdn ?? Number.NaN);
    const hlsUrl = String(record.STRM_HTTP_ADDR ?? record.strmHttpAddr ?? '').trim();

    if (!id || !name || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < 37 || lng < 126) {
        return null;
    }

    return {
        id: `GTIC-${id}`,
        name,
        type: 'traffic',
        status: '정상',
        region: '김포',
        district: inferDistrict(name, address),
        address: address || name,
        operator: '김포시교통정보센터',
        streamUrl: hlsUrl,
        hlsUrl,
        resolution: '4K UHD',
        lat,
        lng,
        source: 'gimpo-its-main',
        coordinateSource: 'official',
        coordinateVerified: true,
        coordinateNote: '김포시교통정보센터 공식 CCTV 좌표',
    };
}

function normalizeCrossCamera(record: GimpoItsApiRecord): CctvItem | null {
    const id = String(record.CMRA_ID ?? record.cmraId ?? '').trim();
    const name = String(
        record.ISTL_LCTN
        ?? record.istlLctn
        ?? record.INSL_LOC
        ?? record.inslLoc
        ?? '',
    ).trim();
    const address = String(
        record.INSL_ADDR
        ?? record.inslAddr
        ?? record.ISTL_ADDR
        ?? record.istlAddr
        ?? '',
    ).trim();
    const lat = Number(
        record.CMRA_Y_CRDN
        ?? record.cmraYCrdn
        ?? record.LAT
        ?? record.lat
        ?? Number.NaN,
    );
    const lng = Number(
        record.CMRA_X_CRDN
        ?? record.cmraXCrdn
        ?? record.LON
        ?? record.lon
        ?? record.lng
        ?? Number.NaN,
    );
    const hlsUrl = String(
        record.HOME_PAGE_URL
        ?? record.homePageUrl
        ?? record.STRM_URL
        ?? record.strmUrl
        ?? record.HLS_URL
        ?? '',
    ).trim();

    if (!id || !name || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < 37 || lng < 126) {
        return null;
    }

    return {
        id: `GTIC-X-${id}`,
        name,
        type: 'traffic',
        status: '정상',
        region: '김포',
        district: inferDistrict(name, address),
        address: address || name,
        operator: '김포시교통정보센터',
        streamUrl: hlsUrl,
        hlsUrl,
        resolution: '4K UHD',
        lat,
        lng,
        source: 'gimpo-its-cross',
        coordinateSource: 'official',
        coordinateVerified: true,
        coordinateNote: '김포시교통정보센터 공식 교차로 CCTV 좌표',
    };
}

export async function fetchGimpoItsCctv(type: 'main' | 'cross' | 'all' = 'main') {
    const cameras: CctvItem[] = [];

    if (type === 'main' || type === 'all') {
        const main = await fetchITS(ENDPOINTS.main, 'cctv_name=');
        const list: GimpoItsApiRecord[] = Array.isArray(main)
            ? main
            : (Array.isArray(main?.resultList) ? main.resultList : (main?.list ?? main?.data ?? []));
        cameras.push(...list.map(normalizeMainCamera).filter((item): item is CctvItem => Boolean(item)));
    }

    if (type === 'cross' || type === 'all') {
        const cross = await fetchITS(ENDPOINTS.cross);
        const list: GimpoItsApiRecord[] = Array.isArray(cross)
            ? cross
            : (Array.isArray(cross?.resultList) ? cross.resultList : (cross?.list ?? cross?.data ?? []));
        cameras.push(...list.map(normalizeCrossCamera).filter((item): item is CctvItem => Boolean(item)));
    }

    return Array.from(new Map(cameras.map((camera) => [camera.id, camera])).values());
}
