import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

type SiteRow = Record<string, string>;
type RowRow = Record<string, string>;

const DATA_DIR = path.join(process.cwd(), 'data');
const P1_SITES_PATH = path.join(DATA_DIR, 'review-needed-p1-sites.csv');
const P1_ROWS_PATH = path.join(DATA_DIR, 'review-needed-p1-rows.csv');
const OUTPUT_SITES_PATH = path.join(DATA_DIR, 'review-needed-p1-suggested-sites.csv');
const OUTPUT_ROWS_PATH = path.join(DATA_DIR, 'review-needed-p1-suggested-rows.csv');
const OUTPUT_MD_PATH = path.join(DATA_DIR, 'review-needed-p1-suggested.md');

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

function escapeCsv(value: string) {
    if (/[",\n]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

function loadCsv(filePath: string) {
    return parseCsv(readFileSync(filePath, 'utf8'));
}

function toNumber(value: string) {
    const parsed = Number((value ?? '').trim());
    return Number.isFinite(parsed) ? parsed : null;
}

function splitLocalIds(value: string) {
    return (value ?? '')
        .split('|')
        .map((part) => part.trim())
        .filter(Boolean);
}

function siteSuggestion(site: SiteRow) {
    const localCount = toNumber(site.local_count ?? '');
    const matchedCameraCount = toNumber(site.matched_camera_count ?? '');
    const minDistanceM = toNumber(site.min_distance_m ?? '');
    const maxScore = toNumber(site.max_score ?? '');
    const reasons: string[] = [];

    const countMatch = localCount !== null && matchedCameraCount !== null && localCount === matchedCameraCount;
    if (countMatch) {
        reasons.push('camera-count-match');
    }

    const strongDistance = minDistanceM !== null && minDistanceM <= 60;
    if (strongDistance) {
        reasons.push(`distance<=60m(${minDistanceM})`);
    }

    const strongScore = maxScore !== null && maxScore >= 216;
    if (strongScore) {
        reasons.push(`score>=216(${maxScore})`);
    }

    const suggested = countMatch && strongDistance && strongScore;
    return {
        suggested,
        suggestion_reason: suggested
            ? reasons.join(', ')
            : [
                countMatch ? '' : `count-mismatch(local=${localCount ?? '-'}, official=${matchedCameraCount ?? '-'})`,
                strongDistance ? '' : `distance-high(${minDistanceM ?? '-'})`,
                strongScore ? '' : `score-low(${maxScore ?? '-'})`,
            ].filter(Boolean).join(', '),
    };
}

function main() {
    mkdirSync(DATA_DIR, { recursive: true });

    const siteRows = loadCsv(P1_SITES_PATH) as SiteRow[];
    const rowRows = loadCsv(P1_ROWS_PATH) as RowRow[];

    const siteHeaders = [
        'suggested_approve',
        'suggestion_reason',
        ...Object.keys(siteRows[0] ?? {}),
    ];

    const suggestedSiteRows: Array<SiteRow & { suggested_approve: string; suggestion_reason: string }> = siteRows.map((row) => {
        const suggestion = siteSuggestion(row);
        return {
            suggested_approve: suggestion.suggested ? 'Y' : '',
            suggestion_reason: suggestion.suggestion_reason,
            ...row,
        };
    });

    const suggestedIds = new Set(
        suggestedSiteRows
            .filter((row) => row.suggested_approve === 'Y')
            .flatMap((row) => splitLocalIds(row.local_ids ?? ''))
    );

    const rowHeaders = [
        'suggested_approve',
        'suggestion_reason',
        ...Object.keys(rowRows[0] ?? {}),
    ];

    const suggestedRowRows: Array<RowRow & { suggested_approve: string; suggestion_reason: string }> = rowRows.map((row) => ({
        suggested_approve: suggestedIds.has((row.id ?? '').trim()) ? 'Y' : '',
        suggestion_reason: suggestedIds.has((row.id ?? '').trim())
            ? 'site-rule-pass'
            : 'site-rule-fail',
        ...row,
    }));

    const siteCsv = [
        siteHeaders.join(','),
        ...suggestedSiteRows.map((row) => siteHeaders.map((header) => escapeCsv(row[header] ?? '')).join(',')),
    ].join('\n');
    writeFileSync(OUTPUT_SITES_PATH, `${siteCsv}\n`, 'utf8');

    const rowCsv = [
        rowHeaders.join(','),
        ...suggestedRowRows.map((row) => rowHeaders.map((header) => escapeCsv(row[header] ?? '')).join(',')),
    ].join('\n');
    writeFileSync(OUTPUT_ROWS_PATH, `${rowCsv}\n`, 'utf8');

    const suggestedSites = suggestedSiteRows.filter((row) => row.suggested_approve === 'Y');
    const suggestedRows = suggestedRowRows.filter((row) => row.suggested_approve === 'Y');

    const lines = [
        '# P1 Suggested Approvals',
        '',
        `- generatedAt: ${new Date().toISOString()}`,
        `- totalSites: ${siteRows.length}`,
        `- suggestedSites: ${suggestedSites.length}`,
        `- totalRows: ${rowRows.length}`,
        `- suggestedRows: ${suggestedRows.length}`,
        '',
        '## Rule',
        '',
        '- `matched_camera_count == local_count`',
        '- `min_distance_m <= 60`',
        '- `max_score >= 216`',
        '',
        '## Suggested Sites',
        '',
        '| Region | MNG_NO | Local IDs | Score | Dist(m) | Reason |',
        '| --- | --- | --- | ---: | ---: | --- |',
        ...suggestedSites.map((row) =>
            `| ${row.region} | ${row.matched_mng_no} | ${splitLocalIds(row.local_ids ?? '').join(', ')} | ${row.max_score} | ${row.min_distance_m} | ${row.suggestion_reason} |`
        ),
        '',
    ];

    writeFileSync(OUTPUT_MD_PATH, `${lines.join('\n')}\n`, 'utf8');

    console.log(JSON.stringify({
        input: {
            sites: P1_SITES_PATH,
            rows: P1_ROWS_PATH,
        },
        output: {
            sites: OUTPUT_SITES_PATH,
            rows: OUTPUT_ROWS_PATH,
            markdown: OUTPUT_MD_PATH,
        },
        summary: {
            totalSites: siteRows.length,
            suggestedSites: suggestedSites.length,
            totalRows: rowRows.length,
            suggestedRows: suggestedRows.length,
        },
        topSuggestedSites: suggestedSites.slice(0, 10).map((row) => ({
            region: row.region,
            matched_mng_no: row.matched_mng_no,
            local_ids: splitLocalIds(row.local_ids ?? ''),
            max_score: row.max_score,
            min_distance_m: row.min_distance_m,
            suggestion_reason: row.suggestion_reason,
        })),
    }, null, 2));
}

main();
