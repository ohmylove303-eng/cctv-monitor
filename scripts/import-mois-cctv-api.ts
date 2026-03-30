import {
    TEMPLATE_PATH,
    applyMatches,
    filterPublicRows,
    loadTemplateRows,
    normalizePublicRow,
    writeTemplateRows,
} from '../lib/public-standard-import';

const MOIS_BASE_URL = 'https://apis.data.go.kr/1741000/cctv_info/info';
const PAGE_SIZE = 100;

function usage() {
    console.error('Usage: npx --yes tsx scripts/import-mois-cctv-api.ts [--dry-run]');
    process.exit(1);
}

type MoisItem = Record<string, unknown>;

async function fetchJson(url: string) {
    const response = await fetch(url, {
        headers: {
            'user-agent': 'Mozilla/5.0 (compatible; CCTVMonitorMOISImporter/1.0)',
            accept: 'application/json,application/xml,text/xml,*/*',
        },
        cache: 'no-store',
    });

    if (!response.ok) {
        throw new Error(`MOIS API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<Record<string, any>>;
}

async function fetchRegionRows(serviceKey: string, region: '김포' | '인천') {
    const allItems: MoisItem[] = [];
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

    const rawRows = [...gimpo.items, ...incheon.items].map(normalizePublicRow);
    const publicRows = filterPublicRows(rawRows);
    const templateRows = loadTemplateRows();
    const result = applyMatches(templateRows, publicRows, '행정안전부_CCTV정보 조회서비스');

    if (!dryRun) {
        writeTemplateRows(result.updatedRows);
    }

    console.log(JSON.stringify({
        dryRun,
        outputPath: TEMPLATE_PATH,
        fetched: {
            gimpoRoadLike: { totalCount: gimpo.totalCount, fetchedCount: gimpo.fetchedCount },
            incheonRoadLike: { totalCount: incheon.totalCount, fetchedCount: incheon.fetchedCount },
            combinedRows: rawRows.length,
            filteredRows: publicRows.length,
        },
        candidateRows: result.candidateRows,
        matchedRows: result.matchedRows,
    }, null, 2));
}

void main();
