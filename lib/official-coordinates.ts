import { promises as fs } from 'fs';
import path from 'path';
import type { CctvItem } from '@/types/cctv';

type CoordinateOverride = {
    id?: string;
    name?: string;
    address?: string;
    region?: string;
    source?: string;
    lat: number;
    lng: number;
    note?: string;
};

type CoordinateOverrideInputRow = CoordinateOverride & {
    status?: string;
    seedLat?: number;
    seedLng?: number;
    sourceDocument?: string;
};

type OverrideSummary = {
    totalOverrides: number;
    appliedOverrides: number;
    unmatchedOverrides: number;
};

type GeoJsonFeatureLike = {
    geometry?: {
        coordinates?: unknown;
    };
    properties?: Record<string, unknown>;
};

type CoordinateOverrideFileType = 'json' | 'csv' | 'geojson';

type CoordinateOverrideFileStat = {
    path: string;
    type: CoordinateOverrideFileType;
    exists: boolean;
};

const JSON_OVERRIDE_PATH = path.join(process.cwd(), 'data', 'official-cctv-coordinates.json');
const CSV_OVERRIDE_PATH = path.join(process.cwd(), 'data', 'official-cctv-coordinates.csv');
const GEOJSON_OVERRIDE_PATH = path.join(process.cwd(), 'data', 'official-cctv-coordinates.geojson');

function parseCoordinate(value: unknown) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : Number.NaN;
    }

    if (typeof value !== 'string') {
        return Number.NaN;
    }

    const normalized = value.trim();
    if (!normalized) {
        return Number.NaN;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeKeyPart(value?: string | null) {
    return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeOverrideStatus(value?: string | null) {
    return normalizeKeyPart(value);
}

function isInactiveOverrideStatus(value?: string | null) {
    const status = normalizeOverrideStatus(value);
    return ['pending', 'template', 'draft', 'disabled', 'inactive', 'review_needed', 'review'].includes(status);
}

function buildMatchKeys(item: Partial<CoordinateOverride>) {
    const keys: string[] = [];
    const id = normalizeKeyPart(item.id);
    const source = normalizeKeyPart(item.source);
    const name = normalizeKeyPart(item.name);
    const address = normalizeKeyPart(item.address);

    if (id) {
        keys.push(`id:${id}`);
    }
    if (source && name) {
        keys.push(`source_name:${source}:${name}`);
    }
    if (source && address) {
        keys.push(`source_address:${source}:${address}`);
    }
    if (name && address) {
        keys.push(`name_address:${name}:${address}`);
    }

    return keys;
}

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

async function fileExists(filePath: string) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function loadJsonOverrides() {
    if (!(await fileExists(JSON_OVERRIDE_PATH))) {
        return [] as CoordinateOverride[];
    }

    const raw = await fs.readFile(JSON_OVERRIDE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
        throw new Error('official-cctv-coordinates.json must be an array');
    }

    return parsed
        .map((entry) => ({
            id: typeof entry?.id === 'string' ? entry.id : undefined,
            name: typeof entry?.name === 'string' ? entry.name : undefined,
            address: typeof entry?.address === 'string' ? entry.address : undefined,
            region: typeof entry?.region === 'string' ? entry.region : undefined,
            source: typeof entry?.source === 'string' ? entry.source : undefined,
            lat: parseCoordinate(entry?.lat),
            lng: parseCoordinate(entry?.lng),
            note: typeof entry?.note === 'string' ? entry.note : undefined,
        }))
        .filter((entry: CoordinateOverride) => Number.isFinite(entry.lat) && Number.isFinite(entry.lng));
}

async function loadCsvInputRows() {
    if (!(await fileExists(CSV_OVERRIDE_PATH))) {
        return [] as CoordinateOverrideInputRow[];
    }

    const raw = await fs.readFile(CSV_OVERRIDE_PATH, 'utf8');
    const lines = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'));

    if (lines.length === 0) {
        return [];
    }

    const headers = splitCsvLine(lines[0]).map((header) => normalizeKeyPart(header));

    return lines.slice(1)
        .map((line) => {
            const cells = splitCsvLine(line);
            const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
            const lat = parseCoordinate(row.official_lat || row.lat);
            const lng = parseCoordinate(row.official_lng || row.lng);

            return {
                id: row.id || undefined,
                name: row.name || undefined,
                address: row.address || undefined,
                region: row.region || undefined,
                source: row.source || undefined,
                lat,
                lng,
                note: row.note || undefined,
                status: row.status || undefined,
                seedLat: parseCoordinate(row.seed_lat),
                seedLng: parseCoordinate(row.seed_lng),
                sourceDocument: row.source_document || undefined,
            } satisfies CoordinateOverrideInputRow;
        })
        .filter((entry: CoordinateOverrideInputRow) =>
            Boolean(entry.id || entry.name || entry.address || entry.source || entry.note || entry.status)
        );
}

async function loadCsvOverrides() {
    const rows = await loadCsvInputRows();

    return rows.filter((entry: CoordinateOverrideInputRow) =>
        !isInactiveOverrideStatus(entry.status)
        && Number.isFinite(entry.lat)
        && Number.isFinite(entry.lng)
    );
}

async function loadGeoJsonOverrides() {
    if (!(await fileExists(GEOJSON_OVERRIDE_PATH))) {
        return [] as CoordinateOverride[];
    }

    const raw = await fs.readFile(GEOJSON_OVERRIDE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const features = Array.isArray(parsed?.features) ? parsed.features : [];

    return features
        .map((feature: GeoJsonFeatureLike) => {
            const coordinates = feature?.geometry?.coordinates;
            const properties = feature?.properties ?? {};

            return {
                id: typeof properties.id === 'string' ? properties.id : undefined,
                name: typeof properties.name === 'string' ? properties.name : undefined,
                address: typeof properties.address === 'string' ? properties.address : undefined,
                region: typeof properties.region === 'string' ? properties.region : undefined,
                source: typeof properties.source === 'string' ? properties.source : undefined,
                lat: parseCoordinate(Array.isArray(coordinates) ? coordinates[1] : Number.NaN),
                lng: parseCoordinate(Array.isArray(coordinates) ? coordinates[0] : Number.NaN),
                note: typeof properties.note === 'string' ? properties.note : undefined,
            } satisfies CoordinateOverride;
        })
        .filter((entry: CoordinateOverride) => Number.isFinite(entry.lat) && Number.isFinite(entry.lng));
}

export async function getOfficialCoordinateFileStats() {
    const files: CoordinateOverrideFileStat[] = [
        { path: JSON_OVERRIDE_PATH, type: 'json', exists: await fileExists(JSON_OVERRIDE_PATH) },
        { path: CSV_OVERRIDE_PATH, type: 'csv', exists: await fileExists(CSV_OVERRIDE_PATH) },
        { path: GEOJSON_OVERRIDE_PATH, type: 'geojson', exists: await fileExists(GEOJSON_OVERRIDE_PATH) },
    ];

    return files;
}

export async function loadOfficialCoordinateOverrides() {
    const [jsonOverrides, csvOverrides, geojsonOverrides] = await Promise.all([
        loadJsonOverrides(),
        loadCsvOverrides(),
        loadGeoJsonOverrides(),
    ]);

    return [...jsonOverrides, ...csvOverrides, ...geojsonOverrides];
}

export async function getOfficialCoordinateInputSummary() {
    const csvRows = await loadCsvInputRows();
    const reviewCsvRows = csvRows.filter((row) => {
        const status = normalizeOverrideStatus(row.status);
        return status === 'review_needed' || status === 'review';
    });
    const pendingCsvRows = csvRows.filter((row) =>
        (isInactiveOverrideStatus(row.status) && !reviewCsvRows.includes(row)) || !Number.isFinite(row.lat) || !Number.isFinite(row.lng)
    );
    const activeCsvRows = csvRows.filter((row) =>
        !isInactiveOverrideStatus(row.status) && Number.isFinite(row.lat) && Number.isFinite(row.lng)
    );

    return {
        csvRows: csvRows.length,
        csvActiveRows: activeCsvRows.length,
        csvPendingRows: pendingCsvRows.length,
        csvReviewRows: reviewCsvRows.length,
        samplePendingIds: pendingCsvRows
            .slice(0, 5)
            .map((row) => row.id)
            .filter((value): value is string => Boolean(value)),
        sampleReviewIds: reviewCsvRows
            .slice(0, 5)
            .map((row) => row.id)
            .filter((value): value is string => Boolean(value)),
    };
}

export async function applyOfficialCoordinateOverrides(items: CctvItem[]) {
    const overrides = await loadOfficialCoordinateOverrides();
    if (overrides.length === 0) {
        return {
            items,
            summary: {
                totalOverrides: 0,
                appliedOverrides: 0,
                unmatchedOverrides: 0,
            } satisfies OverrideSummary,
        };
    }

    const overrideByKey = new Map<string, CoordinateOverride>();
    overrides.forEach((override) => {
        buildMatchKeys(override).forEach((key) => {
            if (!overrideByKey.has(key)) {
                overrideByKey.set(key, override);
            }
        });
    });

    const matched = new Set<CoordinateOverride>();
    const nextItems = items.map((item) => {
        const override = buildMatchKeys(item)
            .map((key) => overrideByKey.get(key))
            .find((entry): entry is CoordinateOverride => Boolean(entry));

        if (!override) {
            return item;
        }

        matched.add(override);
        return {
            ...item,
            lat: override.lat,
            lng: override.lng,
            coordinateSource: 'official' as const,
            coordinateVerified: true,
            coordinateNote: override.note ?? '공식 원본 좌표 반영',
        };
    });

    return {
        items: nextItems,
        summary: {
            totalOverrides: overrides.length,
            appliedOverrides: matched.size,
            unmatchedOverrides: overrides.length - matched.size,
        } satisfies OverrideSummary,
    };
}
