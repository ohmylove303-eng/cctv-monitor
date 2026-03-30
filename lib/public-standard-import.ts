import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

export type CoordinateTemplateRow = {
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
    matched_mng_no?: string;
    matched_manager?: string;
    matched_purpose?: string;
    matched_address?: string;
    matched_distance_m?: string;
    matched_score?: string;
    matched_camera_count?: string;
    match_strategy?: string;
};

export type PublicStandardRow = {
    manager: string;
    purpose: string;
    roadAddress: string;
    jibunAddress: string;
    lat: number;
    lng: number;
};

export const TEMPLATE_PATH = path.join(process.cwd(), 'data', 'official-cctv-coordinates.csv');
export const HEADER = [
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

const PURPOSE_KEYWORDS = ['범죄예방', '방범', '생활방범', '차량방범', '재난', '재해', '화재', '안전'];
const TRAFFIC_KEYWORDS = ['교통', '주정차', '버스전용', '불법주정차'];
const CRIME_KEYWORDS = ['범죄', '방범', '생활방범', '차량방범'];
const FIRE_KEYWORDS = ['화재', '재난', '재해', '안전'];

export function decodeInput(buffer: Buffer) {
    const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    if (!utf8.includes('\uFFFD')) {
        return utf8;
    }

    try {
        return new TextDecoder('euc-kr', { fatal: false }).decode(buffer);
    } catch {
        return utf8;
    }
}

export function pickString(row: Record<string, unknown>, keys: string[]) {
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

export function splitCsvLine(line: string) {
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

export function escapeCsv(value: string) {
    if (/[",\n]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

export function normalizeText(value: string) {
    return value
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[()\-.,]/g, '');
}

export function parseCoordinate(value: string) {
    const parsed = Number((value ?? '').trim());
    return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function inferRegion(address: string, manager: string) {
    const merged = `${address} ${manager}`;
    if (merged.includes('김포')) return '김포';
    if (merged.includes('인천')) return '인천';
    return '';
}

export function isPurposeTarget(value: string) {
    return PURPOSE_KEYWORDS.some((keyword) => value.includes(keyword))
        && !TRAFFIC_KEYWORDS.some((keyword) => value.includes(keyword));
}

function getTemplateBucket(template: CoordinateTemplateRow) {
    if (template.name.includes('소방')) return 'fire';
    return 'crime';
}

function purposeMatchesTemplate(template: CoordinateTemplateRow, purpose: string) {
    const bucket = getTemplateBucket(template);
    if (bucket === 'fire') {
        return FIRE_KEYWORDS.some((keyword) => purpose.includes(keyword));
    }
    return CRIME_KEYWORDS.some((keyword) => purpose.includes(keyword))
        && !FIRE_KEYWORDS.some((keyword) => purpose.includes(keyword));
}

export function loadTemplateRows() {
    const raw = readFileSync(TEMPLATE_PATH, 'utf8');
    const lines = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const headers = splitCsvLine(lines[0]);
    return lines.slice(1).map((line) => {
        const cells = splitCsvLine(line);
        return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])) as CoordinateTemplateRow;
    });
}

export function flattenJsonRows(parsed: unknown): Record<string, unknown>[] {
    if (Array.isArray(parsed)) {
        return parsed.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
    }

    if (!parsed || typeof parsed !== 'object') {
        return [];
    }

    const record = parsed as Record<string, unknown>;
    const directArrayKeys = ['data', 'items', 'results', 'result', 'list'];
    for (const key of directArrayKeys) {
        if (Array.isArray(record[key])) {
            return record[key].filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
        }
    }

    const response = record.response;
    if (response && typeof response === 'object') {
        const body = (response as Record<string, unknown>).body;
        if (body && typeof body === 'object') {
            const bodyRecord = body as Record<string, unknown>;
            const items = bodyRecord.items;
            if (items && typeof items === 'object') {
                const item = (items as Record<string, unknown>).item;
                if (Array.isArray(item)) {
                    return item.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
                }
            }
            for (const key of directArrayKeys) {
                if (Array.isArray(bodyRecord[key])) {
                    return bodyRecord[key].filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
                }
            }
        }
    }

    return [];
}

export function normalizePublicRow(row: Record<string, unknown>) {
    return {
        manager: pickString(row, ['관리기관명', 'manager', 'institutionNm', 'institution_nm', 'mngInsttNm', 'managementAgency', 'MNG_INST_NM']),
        purpose: pickString(row, ['설치목적구분', 'purpose', 'instlPurpsSe', 'instl_purps_se', 'installationPurpose', 'INSTL_PRPS_SE_NM', 'INSTL_PRPS_SE']),
        roadAddress: pickString(row, ['소재지도로명주소', 'roadAddress', 'rdnmadr', 'road_addr', 'LCTN_ROAD_NM_ADDR']),
        jibunAddress: pickString(row, ['소재지지번주소', 'jibunAddress', 'lnmadr', 'jibun_addr', 'LCTN_LOTNO_ADDR']),
        lat: parseCoordinate(pickString(row, ['위도', 'latitude', 'lat', 'WGS84_LAT'])),
        lng: parseCoordinate(pickString(row, ['경도', 'longitude', 'lng', 'lon', 'WGS84_LOT'])),
    } satisfies PublicStandardRow;
}

export function loadPublicRowsFromCsv(raw: string) {
    const lines = raw
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0);

    const headers = splitCsvLine(lines[0]);
    const rows = lines.slice(1).map((line) => {
        const cells = splitCsvLine(line);
        const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])) as Record<string, unknown>;
        return normalizePublicRow(row);
    });

    return rows;
}

export function loadPublicRowsFromJson(raw: string) {
    const parsed = JSON.parse(raw);
    return flattenJsonRows(parsed).map(normalizePublicRow);
}

export function filterPublicRows(rows: PublicStandardRow[]) {
    return rows.filter((row) => {
        const address = row.roadAddress || row.jibunAddress;
        return Boolean(inferRegion(address, row.manager))
            && isPurposeTarget(row.purpose)
            && Number.isFinite(row.lat)
            && Number.isFinite(row.lng);
    });
}

export function scoreMatch(template: CoordinateTemplateRow, candidate: PublicStandardRow) {
    if (!purposeMatchesTemplate(template, candidate.purpose)) {
        return -1;
    }

    const templateAddress = normalizeText(template.address);
    const roadAddress = normalizeText(candidate.roadAddress);
    const jibunAddress = normalizeText(candidate.jibunAddress);
    const district = normalizeText(template.name.split(' ')[0] ?? '');
    let score = 0;

    if (roadAddress && templateAddress === roadAddress) score += 120;
    if (jibunAddress && templateAddress === jibunAddress) score += 110;
    if (roadAddress && (templateAddress.includes(roadAddress) || roadAddress.includes(templateAddress))) score += 70;
    if (jibunAddress && (templateAddress.includes(jibunAddress) || jibunAddress.includes(templateAddress))) score += 65;
    if (district && roadAddress.includes(district)) score += 20;
    if (district && jibunAddress.includes(district)) score += 15;

    return score;
}

export function selectBestMatch(template: CoordinateTemplateRow, candidates: PublicStandardRow[]) {
    let best: PublicStandardRow | null = null;
    let bestScore = -1;

    for (const candidate of candidates) {
        const score = scoreMatch(template, candidate);
        if (score > bestScore) {
            best = candidate;
            bestScore = score;
        }
    }

    if (!best || bestScore < 70) {
        return null;
    }

    return { row: best, score: bestScore };
}

export function applyMatches(
    templateRows: CoordinateTemplateRow[],
    publicRows: PublicStandardRow[],
    sourceDocument: string
) {
    const candidateRows = templateRows.filter((row) =>
        row.status === 'pending'
        && (row.source === 'Gimpo-Local' || row.source === 'Incheon-Local')
    );

    const publicRowsByRegion = publicRows.reduce<Record<string, PublicStandardRow[]>>((acc, row) => {
        const region = inferRegion(row.roadAddress || row.jibunAddress, row.manager);
        if (!acc[region]) acc[region] = [];
        acc[region].push(row);
        return acc;
    }, {});

    let matched = 0;
    const updatedRows = templateRows.map((row) => {
        if (!(row.status === 'pending' && (row.source === 'Gimpo-Local' || row.source === 'Incheon-Local'))) {
            return row;
        }

        const candidates = publicRowsByRegion[row.region] ?? [];
        const best = selectBestMatch(row, candidates);
        if (!best) {
            return row;
        }

        matched += 1;
        return {
            ...row,
            lat: best.row.lat.toFixed(7),
            lng: best.row.lng.toFixed(7),
            status: 'active',
            source_document: sourceDocument,
            note: `공공데이터 표준 CCTV정보 자동 매칭 (${best.row.purpose}, score=${best.score})`,
        } satisfies CoordinateTemplateRow;
    });

    return {
        updatedRows,
        candidateRows: candidateRows.length,
        matchedRows: matched,
    };
}

export function writeTemplateRows(rows: CoordinateTemplateRow[]) {
    const output = [
        HEADER.join(','),
        ...rows.map((row) => HEADER.map((key) => escapeCsv(row[key] ?? '')).join(',')),
    ].join('\n');
    writeFileSync(TEMPLATE_PATH, `${output}\n`, 'utf8');
}
