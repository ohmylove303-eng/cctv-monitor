import {
    HEADER,
    CoordinateTemplateRow,
    loadTemplateRows,
    writeTemplateRows,
} from '../lib/public-standard-import';
import {
    applySemiAutoMoisMatches,
    normalizeMoisOfficialRow,
} from '../lib/mois-semi-auto-match';

const MOIS_BASE_URL = 'https://apis.data.go.kr/1741000/cctv_info/info';
const PAGE_SIZE = 100;

function usage() {
    console.error('Usage: npx --yes tsx scripts/semi-auto-match-mois-cctv.ts [--dry-run]');
    process.exit(1);
}

async function fetchJson(url: string) {
    const response = await fetch(url, {
        headers: {
            'user-agent': 'Mozilla/5.0 (compatible; CCTVMonitorSemiAutoMatcher/1.0)',
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
        region,
        totalCount,
        fetchedCount: allItems.length,
        items: allItems,
    };
}

function mergePreservingResolvedRows(
    originalRows: CoordinateTemplateRow[],
    nextRows: CoordinateTemplateRow[]
) {
    const originalById = new Map(originalRows.map((row) => [row.id, row]));

    return nextRows.map((row) => {
        const original = originalById.get(row.id);
        if (!original) {
            return row;
        }

        if (original.status === 'active' && original.lat && original.lng) {
            return original;
        }

        return row;
    });
}

async function main() {
    const rest = process.argv.slice(2);
    if (rest.some((arg) => arg === '--help' || arg === '-h')) {
        usage();
    }

    const dryRun = rest.includes('--dry-run');
    const serviceKey = process.env.MOIS_CCTV_SERVICE_KEY ?? process.env.PUBLIC_CCTV_SERVICE_KEY;
    if (!serviceKey) {
        throw new Error('MOIS_CCTV_SERVICE_KEY is not configured');
    }

    const [gimpo, incheon] = await Promise.all([
        fetchRegionRows(serviceKey, '김포'),
        fetchRegionRows(serviceKey, '인천'),
    ]);

    const officialRows = [...gimpo.items, ...incheon.items].map(normalizeMoisOfficialRow);
    const templateRows = loadTemplateRows();
    const result = applySemiAutoMoisMatches(
        templateRows,
        officialRows,
        '행정안전부_CCTV정보 조회서비스'
    );
    const mergedRows = mergePreservingResolvedRows(templateRows, result.updatedRows);

    if (!dryRun) {
        writeTemplateRows(mergedRows);
    }

    console.log(JSON.stringify({
        dryRun,
        fetched: {
            gimpoRoadLike: { totalCount: gimpo.totalCount, fetchedCount: gimpo.fetchedCount },
            incheonRoadLike: { totalCount: incheon.totalCount, fetchedCount: incheon.fetchedCount },
            combinedRows: officialRows.length,
        },
        summary: result.summary,
        reviewSamples: mergedRows
            .filter((row) => row.status === 'review_needed')
            .slice(0, 10)
            .map((row) => ({
                id: row.id,
                name: row.name,
                matched_mng_no: row.matched_mng_no,
                matched_score: row.matched_score,
                matched_distance_m: row.matched_distance_m,
            })),
        outputColumns: HEADER,
    }, null, 2));
}

void main();
