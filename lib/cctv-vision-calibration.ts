import { promises as fs } from 'fs';
import path from 'path';
import type { CctvItem, CctvVisionCalibration, CctvVisionTier } from '@/types/cctv';

type CalibrationEntry = CctvVisionCalibration & {
    cctvId: string;
    cctvName?: string;
    region?: string;
};

type CalibrationCatalog = {
    schemaVersion: number;
    taxonomy: 'cctv_vision_calibration_v1';
    entries: CalibrationEntry[];
};

type CalibrationSummary = {
    jsonEntries: number;
    activeEntries: number;
    reviewRows: number;
    reviewActiveRows: number;
    reviewPendingRows: number;
    reviewNeededRows: number;
    reviewKeepHiddenRows: number;
};

const JSON_CALIBRATION_PATH = path.join(process.cwd(), 'data', 'cctv-vision-calibration.json');
const REVIEW_TEMPLATE_PATH = path.join(process.cwd(), 'data', 'cctv-vision-calibration-review-template.csv');

function normalizeStatus(value?: string | null) {
    return (value ?? '').trim().toLowerCase();
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

function isCalibrationEntry(value: unknown): value is CalibrationEntry {
    const entry = value as Partial<CalibrationEntry>;
    return Boolean(
        entry
        && entry.status === 'active'
        && entry.taxonomy === 'cctv_vision_calibration_v1'
        && typeof entry.cctvId === 'string'
        && ['tier_a', 'tier_b', 'tier_c'].includes(entry.visionTier as CctvVisionTier)
        && entry.resolution
        && typeof entry.resolution.width === 'number'
        && typeof entry.resolution.height === 'number'
    );
}

export async function loadCctvVisionCalibrations() {
    if (!(await fileExists(JSON_CALIBRATION_PATH))) {
        return [] as CalibrationEntry[];
    }

    const raw = await fs.readFile(JSON_CALIBRATION_PATH, 'utf8');
    const parsed = JSON.parse(raw) as CalibrationCatalog;
    if (parsed.schemaVersion !== 1 || parsed.taxonomy !== 'cctv_vision_calibration_v1' || !Array.isArray(parsed.entries)) {
        throw new Error('cctv-vision-calibration.json has an invalid schema');
    }

    return parsed.entries.filter(isCalibrationEntry);
}

export async function applyCctvVisionCalibrations(items: CctvItem[]) {
    const calibrations = await loadCctvVisionCalibrations();
    const byId = new Map(calibrations.map((entry) => [entry.cctvId, entry]));

    return {
        items: items.map((item) => {
            const calibration = byId.get(item.id);
            if (!calibration) {
                return item;
            }

            const { cctvId: _cctvId, cctvName: _cctvName, region: _region, ...visionCalibration } = calibration;
            return {
                ...item,
                visionCalibration,
            };
        }),
        summary: {
            totalCalibrations: calibrations.length,
            appliedCalibrations: items.filter((item) => byId.has(item.id)).length,
            unmatchedCalibrations: calibrations.filter((entry) => !items.some((item) => item.id === entry.cctvId)).length,
        },
    };
}

export async function getCctvVisionCalibrationInputSummary(): Promise<CalibrationSummary> {
    const calibrations = await loadCctvVisionCalibrations();
    const summary: CalibrationSummary = {
        jsonEntries: calibrations.length,
        activeEntries: calibrations.length,
        reviewRows: 0,
        reviewActiveRows: 0,
        reviewPendingRows: 0,
        reviewNeededRows: 0,
        reviewKeepHiddenRows: 0,
    };

    if (!(await fileExists(REVIEW_TEMPLATE_PATH))) {
        return summary;
    }

    const raw = await fs.readFile(REVIEW_TEMPLATE_PATH, 'utf8');
    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length <= 1) {
        return summary;
    }

    const headers = splitCsvLine(lines[0]);
    const statusIndex = headers.indexOf('reviewStatus');
    for (const line of lines.slice(1)) {
        const values = splitCsvLine(line);
        const status = normalizeStatus(values[statusIndex]);
        if (!status) {
            continue;
        }
        summary.reviewRows += 1;
        if (status === 'active') summary.reviewActiveRows += 1;
        if (status === 'pending') summary.reviewPendingRows += 1;
        if (status === 'review_needed') summary.reviewNeededRows += 1;
        if (status === 'keep_hidden') summary.reviewKeepHiddenRows += 1;
    }

    return summary;
}

export async function getCctvVisionCalibrationFileStats() {
    return Promise.all([
        { path: JSON_CALIBRATION_PATH, type: 'json' as const },
        { path: REVIEW_TEMPLATE_PATH, type: 'review_csv' as const },
    ].map(async (file) => ({
        ...file,
        exists: await fileExists(file.path),
    })));
}
