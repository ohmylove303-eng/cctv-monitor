import { NextRequest, NextResponse } from 'next/server';
import { scoreMatch } from '@/lib/public-standard-import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 300;

const MOIS_BASE_URL = 'https://apis.data.go.kr/1741000/cctv_info/info';
const PAGE_SIZE = 100;
const CACHE_TTL_MS = 15 * 60 * 1000;

type LookupRegion = '김포' | '인천';
type LookupCameraType = 'crime' | 'fire' | 'traffic';

type MoisLookupRow = {
    mngNo: string;
    manager: string;
    managerTel: string;
    purpose: string;
    roadAddress: string;
    jibunAddress: string;
    lat: number;
    lng: number;
    installedYm: string;
    dataDate: string;
    lastModified: string;
    cameraCount: string;
};

type CacheEntry = {
    expiresAt: number;
    rows: MoisLookupRow[];
};

const regionCache = new Map<LookupRegion, CacheEntry>();

function pickString(row: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const value = row[key];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
        if (typeof value === 'number' && Number.isFinite(value)) {
            return String(value);
        }
    }

    return '';
}

function parseCoordinate(value: string) {
    const parsed = Number((value ?? '').trim());
    return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeText(value: string) {
    return value
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[()\-.,]/g, '');
}

function toLookupRow(row: Record<string, unknown>): MoisLookupRow {
    return {
        mngNo: pickString(row, ['MNG_NO', 'mngNo', '관리번호']),
        manager: pickString(row, ['MNG_INST_NM', 'mngInstNm', '관리기관명']),
        managerTel: pickString(row, ['MNG_INST_TELNO', 'mngInstTelno', '관리기관전화번호']),
        purpose: pickString(row, ['INSTL_PRPS_SE_NM', 'instlPrpsSeNm', '설치목적구분']),
        roadAddress: pickString(row, ['LCTN_ROAD_NM_ADDR', 'roadAddress', '소재지도로명주소']),
        jibunAddress: pickString(row, ['LCTN_LOTNO_ADDR', 'jibunAddress', '소재지지번주소']),
        lat: parseCoordinate(pickString(row, ['WGS84_LAT', 'lat', '위도'])),
        lng: parseCoordinate(pickString(row, ['WGS84_LOT', 'lng', '경도'])),
        installedYm: pickString(row, ['INSTL_YM', 'instlYm', '설치년월']),
        dataDate: pickString(row, ['DAT_CRTR_YMD', 'datCrtrYmd', '자료기준일']),
        lastModified: pickString(row, ['LAST_MDFCN_PNT', 'lastMdfcnPnt', '수정일시']),
        cameraCount: pickString(row, ['CAM_CNTOM', 'camCntom', '카메라대수']),
    };
}

function inferCameraType(name: string, requestedType: string | null): LookupCameraType {
    if (requestedType === 'fire' || name.includes('소방')) return 'fire';
    if (requestedType === 'traffic' || name.includes('교통')) return 'traffic';
    return 'crime';
}

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const earthRadiusMeters = 6371000;
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const q =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;

    return 2 * earthRadiusMeters * Math.asin(Math.sqrt(q));
}

function isSupportedPurpose(row: MoisLookupRow, cameraType: LookupCameraType) {
    if (cameraType === 'traffic') {
        return false;
    }

    if (cameraType === 'fire') {
        return ['화재', '재난', '재해', '안전'].some((keyword) => row.purpose.includes(keyword));
    }

    return ['범죄', '방범', '생활방범', '차량방범'].some((keyword) => row.purpose.includes(keyword))
        && !['화재', '재난', '재해'].some((keyword) => row.purpose.includes(keyword));
}

function matchesLookupRegion(row: MoisLookupRow, region: LookupRegion) {
    const mergedAddress = `${row.roadAddress} ${row.jibunAddress}`.trim();

    if (region === '김포') {
        return mergedAddress.includes('김포시')
            || (!mergedAddress && row.manager.includes('김포'));
    }

    return mergedAddress.includes('인천광역시')
        || mergedAddress.includes('인천시')
        || (!mergedAddress && row.manager.includes('인천'));
}

function filterRegionRows(rows: MoisLookupRow[], region: LookupRegion, cameraType: LookupCameraType) {
    return rows.filter((row) => {
        return matchesLookupRegion(row, region)
            && isSupportedPurpose(row, cameraType)
            && Number.isFinite(row.lat)
            && Number.isFinite(row.lng);
    });
}

async function fetchJson(url: string) {
    let response: Response;
    try {
        response = await fetch(url, {
            headers: {
                'user-agent': 'Mozilla/5.0 (compatible; CCTVMonitorMOISLookup/1.0)',
                accept: 'application/json,application/xml,text/xml,*/*',
            },
            cache: 'no-store',
        });
    } catch (error) {
        throw new Error(
            `MOIS API network error: ${error instanceof Error ? error.message : 'unknown'}`
        );
    }

    const rawText = await response.text();

    if (!response.ok) {
        throw new Error(
            `MOIS API request failed: ${response.status} ${response.statusText} ${rawText.slice(0, 200)}`
        );
    }

    try {
        return JSON.parse(rawText) as Record<string, any>;
    } catch {
        throw new Error(`MOIS API returned non-JSON payload: ${rawText.slice(0, 200)}`);
    }
}

async function fetchRegionRows(serviceKey: string, region: LookupRegion) {
    const cached = regionCache.get(region);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.rows;
    }

    const rows: MoisLookupRow[] = [];
    let pageNo = 1;
    let totalCount = 0;

    while (true) {
        const params = new URLSearchParams({
            serviceKey,
            pageNo: String(pageNo),
            numOfRows: String(PAGE_SIZE),
            returnType: 'JSON',
            'cond[LCTN_ROAD_NM_ADDR::LIKE]': region,
        });
        const payload = await fetchJson(`${MOIS_BASE_URL}?${params.toString()}`);
        const body = payload?.response?.body;
        const items = body?.items?.item ?? [];

        if (pageNo === 1) {
            totalCount = Number(body?.totalCount ?? 0);
        }

        if (!Array.isArray(items) || items.length === 0) {
            break;
        }

        rows.push(...items.map((item) => toLookupRow(item)));

        if (rows.length >= totalCount || items.length < PAGE_SIZE) {
            break;
        }

        pageNo += 1;
    }

    regionCache.set(region, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        rows,
    });

    return rows;
}

export async function GET(request: NextRequest) {
    try {
        const serviceKey = process.env.MOIS_CCTV_SERVICE_KEY ?? process.env.PUBLIC_CCTV_SERVICE_KEY;
        if (!serviceKey) {
            return NextResponse.json(
                { error: 'MOIS_CCTV_SERVICE_KEY is not configured' },
                { status: 503 }
            );
        }

        const searchParams = request.nextUrl.searchParams;
        const id = searchParams.get('id') ?? '';
        const name = searchParams.get('name') ?? '';
        const address = searchParams.get('address') ?? '';
        const region = searchParams.get('region');
        const requestedType = searchParams.get('cameraType');
        const lat = Number(searchParams.get('lat'));
        const lng = Number(searchParams.get('lng'));

        if (!name || !address || (region !== '김포' && region !== '인천')) {
            return NextResponse.json(
                { error: 'name, address, region(김포/인천) are required' },
                { status: 400 }
            );
        }

        const cameraType = inferCameraType(name, requestedType);
        if (cameraType === 'traffic') {
            return NextResponse.json({
                supported: false,
                reason: 'traffic cameras are already served from verified ITS/UTIC sources',
            });
        }

        const regionRows = await fetchRegionRows(serviceKey, region);
        const scoredCandidates = filterRegionRows(regionRows, region, cameraType)
            .map((row) => {
                const template = {
                    id,
                    name,
                    address,
                    region,
                    source: region === '김포' ? 'Gimpo-Local' : 'Incheon-Local',
                    seed_lat: '',
                    seed_lng: '',
                    lat: '',
                    lng: '',
                    status: 'pending',
                    source_document: '',
                    note: '',
                };
                const score = scoreMatch(template, row);
                const currentDistanceMeters = Number.isFinite(lat) && Number.isFinite(lng)
                    ? Math.round(haversineMeters(lat, lng, row.lat, row.lng))
                    : null;
                return {
                    ...row,
                    score,
                    currentDistanceMeters,
                    normalizedAddress: normalizeText(row.roadAddress || row.jibunAddress),
                };
            });

        const byScoreThenDistance = (
            left: (typeof scoredCandidates)[number],
            right: (typeof scoredCandidates)[number]
        ) =>
            right.score - left.score
            || (left.currentDistanceMeters ?? Number.POSITIVE_INFINITY) - (right.currentDistanceMeters ?? Number.POSITIVE_INFINITY);

        const strongCandidates = scoredCandidates
            .filter((row) => row.score >= 40)
            .sort(byScoreThenDistance);

        const nearbyCandidates = scoredCandidates
            .filter((row) => row.currentDistanceMeters !== null && row.currentDistanceMeters <= 5000)
            .sort((left, right) =>
                (left.currentDistanceMeters ?? Number.POSITIVE_INFINITY) - (right.currentDistanceMeters ?? Number.POSITIVE_INFINITY)
                || right.score - left.score
            );

        const candidates = (strongCandidates.length > 0 ? strongCandidates : nearbyCandidates).slice(0, 3);
        const bestMatch = strongCandidates[0] && strongCandidates[0].score >= 70 ? strongCandidates[0] : null;

        return NextResponse.json({
            supported: true,
            source: '행정안전부_CCTV정보 조회서비스',
            query: {
                id,
                name,
                address,
                region,
                cameraType,
            },
            matched: Boolean(bestMatch),
            bestMatch,
            matchStrategy: bestMatch ? 'exact-ish' : strongCandidates.length > 0 ? 'scored-candidates' : candidates.length > 0 ? 'nearby-candidates' : 'none',
            candidates,
            regionRowCount: regionRows.length,
        }, {
            headers: {
                'Cache-Control': 's-maxage=300, stale-while-revalidate=1800',
            },
        });
    } catch (error) {
        console.error('official-metadata lookup failed', error);
        return NextResponse.json(
            {
                supported: false,
                error: error instanceof Error ? error.message : 'official metadata lookup failed',
            },
            { status: 502 }
        );
    }
}
