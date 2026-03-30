import { CoordinateTemplateRow } from '../lib/public-standard-import';
import {
    applySemiAutoMoisMatches,
    filterTargetMoisRows,
    normalizeMoisOfficialRow,
    type MoisOfficialRow,
} from '../lib/mois-semi-auto-match';

const MOIS_BASE_URL = 'https://apis.data.go.kr/1741000/cctv_info/info';
const PAGE_SIZE = 100;

function usage() {
    console.error('Usage: npx --yes tsx scripts/backtest-mois-matcher.ts [--sample 120]');
    process.exit(1);
}

async function fetchJson(url: string) {
    const response = await fetch(url, {
        headers: {
            'user-agent': 'Mozilla/5.0 (compatible; CCTVMonitorMatcherBacktest/1.0)',
            accept: 'application/json,application/xml,text/xml,*/*',
        },
        cache: 'no-store',
    });

    const raw = await response.text();
    if (!response.ok) {
        throw new Error(`MOIS API request failed: ${response.status} ${response.statusText} ${raw.slice(0, 200)}`);
    }

    return JSON.parse(raw) as Record<string, any>;
}

async function fetchRegionRows(serviceKey: string, region: '김포' | '인천') {
    const allItems: Record<string, unknown>[] = [];
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

        allItems.push(...items);

        if (allItems.length >= totalCount || items.length < PAGE_SIZE) {
            break;
        }

        pageNo += 1;
    }

    return {
        totalCount,
        fetchedCount: allItems.length,
        items: allItems,
    };
}

function hashString(value: string) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function offsetCoordinate(lat: number, lng: number, seed: string) {
    const hash = hashString(seed);
    const distanceMeters = 40 + (hash % 360);
    const bearingRad = ((hash % 360) * Math.PI) / 180;
    const dLat = (distanceMeters * Math.cos(bearingRad)) / 111320;
    const dLng = (distanceMeters * Math.sin(bearingRad)) / (111320 * Math.cos((lat * Math.PI) / 180));

    return {
        lat: lat + dLat,
        lng: lng + dLng,
        distanceMeters,
    };
}

function extractDistrictToken(value: string) {
    const tokens = value.match(/[가-힣A-Za-z0-9]+/g) ?? [];
    return tokens.find((token) => /(?:구|동|읍|면|리)$/.test(token)) ?? '';
}

function degradeAddress(address: string) {
    return address
        .replace(/^경기도\s*김포시\s*/, '김포 ')
        .replace(/^인천광역시\s*/, '인천 ')
        .replace(/\([^)]*\)/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function toSyntheticTemplateRows(rows: MoisOfficialRow[], sampleSize: number) {
    const targets = rows
        .filter((row) => row.mngNo && (row.roadAddress || row.jibunAddress))
        .slice(0, sampleSize)
        .map((row, index) => {
            const address = row.roadAddress || row.jibunAddress;
            const district = extractDistrictToken(address) || row.region;
            const purposeLabel = row.purpose.includes('화재') || row.purpose.includes('재난') || row.purpose.includes('안전')
                ? '소방'
                : '방범';
            const source = row.region === '김포' ? 'Gimpo-Local' : 'Incheon-Local';
            const shifted = offsetCoordinate(row.lat, row.lng, row.mngNo);
            const itemCount = Math.min(Math.max(row.cameraCount, 1), 3);
            const rowsForSite: CoordinateTemplateRow[] = [];

            for (let copyIndex = 0; copyIndex < itemCount; copyIndex += 1) {
                rowsForSite.push({
                    id: `BT-${index + 1}-${copyIndex + 1}`,
                    name: `${district} ${purposeLabel} CCTV-${copyIndex + 1}`,
                    address: degradeAddress(address),
                    region: row.region,
                    source,
                    seed_lat: shifted.lat.toFixed(6),
                    seed_lng: shifted.lng.toFixed(6),
                    lat: '',
                    lng: '',
                    status: 'pending',
                    source_document: '',
                    note: `backtest target ${row.mngNo}`,
                    matched_mng_no: '',
                    matched_manager: '',
                    matched_purpose: '',
                    matched_address: '',
                    matched_distance_m: '',
                    matched_score: '',
                    matched_camera_count: '',
                    match_strategy: '',
                });
            }

            return {
                target: row,
                templates: rowsForSite,
                syntheticDistanceMeters: shifted.distanceMeters,
            };
        });

    return targets;
}

async function main() {
    const rest = process.argv.slice(2);
    if (rest.some((arg) => arg === '--help' || arg === '-h')) {
        usage();
    }

    const sampleIndex = rest.findIndex((arg) => arg === '--sample');
    const sampleSize = sampleIndex >= 0 ? Number(rest[sampleIndex + 1]) || 120 : 120;
    const serviceKey = process.env.MOIS_CCTV_SERVICE_KEY ?? process.env.PUBLIC_CCTV_SERVICE_KEY;
    if (!serviceKey) {
        throw new Error('MOIS_CCTV_SERVICE_KEY is not configured');
    }

    const [gimpo, incheon] = await Promise.all([
        fetchRegionRows(serviceKey, '김포'),
        fetchRegionRows(serviceKey, '인천'),
    ]);

    const officialRows = filterTargetMoisRows(
        [...gimpo.items, ...incheon.items].map(normalizeMoisOfficialRow)
    );
    const syntheticSites = toSyntheticTemplateRows(officialRows, sampleSize);
    const templateRows = syntheticSites.flatMap((site) => site.templates);
    const result = applySemiAutoMoisMatches(templateRows, officialRows, 'backtest');
    const rowById = new Map(result.updatedRows.map((row) => [row.id, row]));

    let exactRecovered = 0;
    let autoExactRecovered = 0;
    let autoSites = 0;
    let reviewSites = 0;

    const misses: Array<Record<string, unknown>> = [];

    syntheticSites.forEach((site) => {
        const firstTemplate = site.templates[0];
        const matched = rowById.get(firstTemplate.id);
        const matchedMngNo = matched?.matched_mng_no ?? '';
        const correct = matchedMngNo === site.target.mngNo;

        if (correct) {
            exactRecovered += 1;
        }

        if (matched?.status === 'active') {
            autoSites += 1;
            if (correct) {
                autoExactRecovered += 1;
            }
        } else if (matched?.status === 'review_needed') {
            reviewSites += 1;
        }

        if (!correct && misses.length < 10) {
            misses.push({
                id: firstTemplate.id,
                targetMngNo: site.target.mngNo,
                matchedMngNo,
                status: matched?.status ?? 'pending',
                score: matched?.matched_score ?? '',
                distanceM: matched?.matched_distance_m ?? '',
                address: firstTemplate.address,
                targetAddress: site.target.roadAddress || site.target.jibunAddress,
            });
        }
    });

    console.log(JSON.stringify({
        sampleSize,
        officialRows: officialRows.length,
        syntheticTemplateRows: templateRows.length,
        summary: result.summary,
        metrics: {
            siteCount: syntheticSites.length,
            exactRecovered,
            top1Accuracy: Number((exactRecovered / Math.max(syntheticSites.length, 1)).toFixed(4)),
            autoSites,
            autoExactRecovered,
            autoPrecision: Number((autoExactRecovered / Math.max(autoSites, 1)).toFixed(4)),
            reviewSites,
        },
        misses,
    }, null, 2));
}

void main();
