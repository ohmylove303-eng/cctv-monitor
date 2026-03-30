import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { gimpoCctv } from '../data/cctv-gimpo';
import { incheonCctv } from '../data/cctv-incheon';

type CsvRow = {
    id: string;
    name: string;
    address: string;
    region: string;
    source: string;
    seed_lat: string;
    seed_lng: string;
    lat: string;
    lng: string;
    status: string;
    source_document: string;
    note: string;
    matched_mng_no: string;
    matched_manager: string;
    matched_purpose: string;
    matched_address: string;
    matched_distance_m: string;
    matched_score: string;
    matched_camera_count: string;
    match_strategy: string;
};

const CSV_PATH = path.join(process.cwd(), 'data', 'official-cctv-coordinates.csv');
const HEADER = [
    'id',
    'name',
    'address',
    'region',
    'source',
    'seed_lat',
    'seed_lng',
    'lat',
    'lng',
    'status',
    'source_document',
    'note',
    'matched_mng_no',
    'matched_manager',
    'matched_purpose',
    'matched_address',
    'matched_distance_m',
    'matched_score',
    'matched_camera_count',
    'match_strategy',
] as const;

function splitCsvLine(line: string) {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];

        if (char === '"') {
            if (inQuotes && line[index + 1] === '"') {
                current += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === ',' && !inQuotes) {
            values.push(current);
            current = '';
            continue;
        }

        current += char;
    }

    values.push(current);
    return values.map((value) => value.trim());
}

function escapeCsv(value: string) {
    if (/[",\n]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

function formatCoordinate(value: number) {
    return Number.isFinite(value) ? value.toFixed(6) : '';
}

function inferLocalSource(region: string, type: string) {
    if (type === 'traffic') {
        return region === '김포' ? 'Gimpo-Local-Traffic' : 'Incheon-Local-Traffic';
    }

    return region === '김포' ? 'Gimpo-Local' : 'Incheon-Local';
}

function inferTypeLabel(name: string) {
    if (name.includes('방범')) return '방범';
    if (name.includes('소방')) return '소방';
    if (name.includes('교통')) return '교통';
    return 'CCTV';
}

function hasOfficialTrafficFeed(region: string, type: string) {
    return type === 'traffic' && (region === '김포' || region === '인천');
}

function loadExistingRows() {
    try {
        const raw = readFileSync(CSV_PATH, 'utf8');
        const lines = raw
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

        if (lines.length === 0) {
            return new Map<string, CsvRow>();
        }

        const headers = splitCsvLine(lines[0]);
        const rows = new Map<string, CsvRow>();

        lines.slice(1).forEach((line) => {
            const cells = splitCsvLine(line);
            const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])) as CsvRow;
            if (row.id) {
                rows.set(row.id, row);
            }
        });

        return rows;
    } catch {
        return new Map<string, CsvRow>();
    }
}

const allKnownLocalItems = [...gimpoCctv, ...incheonCctv];
const knownLocalIds = new Set(allKnownLocalItems.map((item) => item.id));

const localItems = allKnownLocalItems
    .filter((item) => !hasOfficialTrafficFeed(item.region, item.type))
    .map((item) => {
    const source = inferLocalSource(item.region, item.type);
    const typeLabel = inferTypeLabel(item.name);
    return {
        id: item.id,
        name: item.name,
        address: item.address,
        region: item.region,
        source,
        seed_lat: formatCoordinate(item.lat),
        seed_lng: formatCoordinate(item.lng),
        lat: '',
        lng: '',
        status: 'pending',
        source_document: '',
        note: `${item.region} ${typeLabel} 1차 검수 대기`,
        matched_mng_no: '',
        matched_manager: '',
        matched_purpose: '',
        matched_address: '',
        matched_distance_m: '',
        matched_score: '',
        matched_camera_count: '',
        match_strategy: '',
    } satisfies CsvRow;
});

const existingById = loadExistingRows();

const mergedRows = localItems.map((row) => {
    const existing = existingById.get(row.id);
    if (!existing) {
        return row;
    }

    return {
        ...row,
        lat: existing.lat || row.lat,
        lng: existing.lng || row.lng,
        status: existing.status || row.status,
        source_document: existing.source_document || row.source_document,
        note: existing.note || row.note,
        matched_mng_no: existing.matched_mng_no || row.matched_mng_no,
        matched_manager: existing.matched_manager || row.matched_manager,
        matched_purpose: existing.matched_purpose || row.matched_purpose,
        matched_address: existing.matched_address || row.matched_address,
        matched_distance_m: existing.matched_distance_m || row.matched_distance_m,
        matched_score: existing.matched_score || row.matched_score,
        matched_camera_count: existing.matched_camera_count || row.matched_camera_count,
        match_strategy: existing.match_strategy || row.match_strategy,
    } satisfies CsvRow;
});

const mergedIds = new Set(mergedRows.map((row) => row.id));
const extraRows = Array.from(existingById.values()).filter((row) => !mergedIds.has(row.id) && !knownLocalIds.has(row.id));
const finalRows = [...mergedRows, ...extraRows];

const csv = [
    HEADER.join(','),
    ...finalRows.map((row) => HEADER.map((key) => escapeCsv(row[key] ?? '')).join(',')),
].join('\n');

writeFileSync(CSV_PATH, `${csv}\n`, 'utf8');

const summary = finalRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status || 'unknown'] = (acc[row.status || 'unknown'] ?? 0) + 1;
    return acc;
}, {});

console.log(JSON.stringify({
    path: CSV_PATH,
    totalRows: finalRows.length,
    statusSummary: summary,
}, null, 2));
