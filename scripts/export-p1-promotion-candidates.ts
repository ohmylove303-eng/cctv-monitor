import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import {
    CoordinateTemplateRow,
    loadTemplateRows,
} from '../lib/public-standard-import';

type ReviewSiteRow = {
    priority: string;
    region: string;
    source: string;
    matched_mng_no: string;
    matched_manager: string;
    matched_purpose: string;
    matched_address: string;
    matched_camera_count: string;
    local_count: string;
    min_distance_m: string;
    max_score: string;
    min_score: string;
    recommendation: string;
    local_ids: string;
    local_names: string;
    local_addresses: string;
};

const DATA_DIR = path.join(process.cwd(), 'data');
const REVIEW_PRIORITY_CSV = path.join(DATA_DIR, 'review-needed-priority.csv');
const SITE_CANDIDATES_CSV = path.join(DATA_DIR, 'review-needed-p1-sites.csv');
const ROW_CANDIDATES_CSV = path.join(DATA_DIR, 'review-needed-p1-rows.csv');
const SUMMARY_MD = path.join(DATA_DIR, 'review-needed-p1.md');

function parseCsv(raw: string) {
    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) {
        return [] as Record<string, string>[];
    }

    const headers = splitCsvLine(lines[0]);
    return lines.slice(1).map((line) => {
        const cells = splitCsvLine(line);
        return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
    });
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

function escapeCsv(value: string) {
    if (/[",\n]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

function loadExistingCsv(filePath: string) {
    if (!existsSync(filePath)) {
        return [] as Record<string, string>[];
    }
    const raw = readFileSync(filePath, 'utf8');
    return parseCsv(raw);
}

function loadReviewSites() {
    const raw = require('fs').readFileSync(REVIEW_PRIORITY_CSV, 'utf8');
    return parseCsv(raw) as ReviewSiteRow[];
}

function toNumber(value: string) {
    const parsed = Number((value ?? '').trim());
    return Number.isFinite(parsed) ? parsed : null;
}

function main() {
    mkdirSync(DATA_DIR, { recursive: true });

    const p1Sites = loadReviewSites().filter((row) => row.priority === 'P1');
    const allRows = loadTemplateRows();
    const rowById = new Map(allRows.map((row) => [row.id, row]));
    const existingSiteRows = loadExistingCsv(SITE_CANDIDATES_CSV);
    const existingRowRows = loadExistingCsv(ROW_CANDIDATES_CSV);
    const existingSiteByKey = new Map(
        existingSiteRows.map((row) => [
            `${row.matched_mng_no ?? ''}|${row.local_ids ?? ''}`,
            row,
        ])
    );
    const existingRowById = new Map(existingRowRows.map((row) => [row.id ?? '', row]));

    const siteCandidateHeaders = [
        'approve',
        'checked_note',
        'priority',
        'region',
        'matched_mng_no',
        'matched_manager',
        'matched_purpose',
        'matched_address',
        'matched_camera_count',
        'local_count',
        'min_distance_m',
        'max_score',
        'recommendation',
        'local_ids',
        'local_names',
        'local_addresses',
    ];

    const siteCandidateRows = p1Sites.map((site) => ({
        approve: existingSiteByKey.get(`${site.matched_mng_no}|${site.local_ids}`)?.approve ?? '',
        checked_note: existingSiteByKey.get(`${site.matched_mng_no}|${site.local_ids}`)?.checked_note ?? '',
        priority: site.priority,
        region: site.region,
        matched_mng_no: site.matched_mng_no,
        matched_manager: site.matched_manager,
        matched_purpose: site.matched_purpose,
        matched_address: site.matched_address,
        matched_camera_count: site.matched_camera_count,
        local_count: site.local_count,
        min_distance_m: site.min_distance_m,
        max_score: site.max_score,
        recommendation: site.recommendation,
        local_ids: site.local_ids,
        local_names: site.local_names,
        local_addresses: site.local_addresses,
    }));

    const siteCsv = [
        siteCandidateHeaders.join(','),
        ...siteCandidateRows.map((row) => siteCandidateHeaders.map((header) => escapeCsv(row[header as keyof typeof row] ?? '')).join(',')),
    ].join('\n');
    writeFileSync(SITE_CANDIDATES_CSV, `${siteCsv}\n`, 'utf8');

    const p1Ids = new Set(
        p1Sites
            .flatMap((site) => site.local_ids.split(' | '))
            .map((value) => value.trim())
            .filter(Boolean)
    );

    const rowCandidateHeaders = [
        'approve',
        'checked_note',
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
        'matched_mng_no',
        'matched_manager',
        'matched_purpose',
        'matched_address',
        'matched_distance_m',
        'matched_score',
        'matched_camera_count',
        'match_strategy',
    ];

    const p1Rows = Array.from(p1Ids)
        .map((id) => rowById.get(id))
        .filter((row): row is CoordinateTemplateRow => Boolean(row))
        .sort((left, right) =>
            (toNumber(right.matched_score ?? '') ?? -1) - (toNumber(left.matched_score ?? '') ?? -1)
            || (toNumber(left.matched_distance_m ?? '') ?? Number.POSITIVE_INFINITY) - (toNumber(right.matched_distance_m ?? '') ?? Number.POSITIVE_INFINITY)
            || left.id.localeCompare(right.id)
        );

    const rowCsv = [
        rowCandidateHeaders.join(','),
        ...p1Rows.map((row) => rowCandidateHeaders.map((header) => {
            if (header === 'approve') return existingRowById.get(row.id)?.approve ?? '';
            if (header === 'checked_note') return existingRowById.get(row.id)?.checked_note ?? '';
            return escapeCsv((row as Record<string, string>)[header] ?? '');
        }).join(',')),
    ].join('\n');
    writeFileSync(ROW_CANDIDATES_CSV, `${rowCsv}\n`, 'utf8');

    const summaryLines = [
        '# P1 Promotion Candidates',
        '',
        `- generatedAt: ${new Date().toISOString()}`,
        `- p1Sites: ${p1Sites.length}`,
        `- p1Rows: ${p1Rows.length}`,
        '',
        `- siteFile: ${SITE_CANDIDATES_CSV}`,
        `- rowFile: ${ROW_CANDIDATES_CSV}`,
        '',
        '## Rule',
        '',
        '- `approve=Y`를 표시한 뒤 수동 승격 대상으로 사용',
        '- 현재 이 파일은 참고/검토용이며 자동 승격은 하지 않음',
        '',
        '## Top 10',
        '',
        '| Region | MNG_NO | Local IDs | Score | Dist(m) | Official Address |',
        '| --- | --- | --- | ---: | ---: | --- |',
        ...p1Sites.slice(0, 10).map((site) =>
            `| ${site.region} | ${site.matched_mng_no} | ${site.local_ids.split(' | ').join(', ')} | ${site.max_score} | ${site.min_distance_m} | ${site.matched_address} |`
        ),
        '',
    ];
    writeFileSync(SUMMARY_MD, summaryLines.join('\n'), 'utf8');

    console.log(JSON.stringify({
        p1Sites: p1Sites.length,
        p1Rows: p1Rows.length,
        siteCandidatesCsv: SITE_CANDIDATES_CSV,
        rowCandidatesCsv: ROW_CANDIDATES_CSV,
        summaryMarkdown: SUMMARY_MD,
    }, null, 2));
}

main();
