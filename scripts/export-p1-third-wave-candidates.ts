import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

type SiteRow = Record<string, string>;
type RowRow = Record<string, string>;
type ClassifiedSiteRow = SiteRow & {
    bucket: string;
    blocker_reason: string;
};

const DATA_DIR = path.join(process.cwd(), 'data');
const P1_SITES_PATH = path.join(DATA_DIR, 'review-needed-p1-sites.csv');
const P1_ROWS_PATH = path.join(DATA_DIR, 'review-needed-p1-rows.csv');
const BUCKETS_CSV_PATH = path.join(DATA_DIR, 'review-needed-p1-remaining-buckets.csv');
const BUCKETS_MD_PATH = path.join(DATA_DIR, 'review-needed-p1-remaining-buckets.md');
const THIRD_WAVE_SITES_CSV_PATH = path.join(DATA_DIR, 'review-needed-p1-third-wave-sites.csv');
const THIRD_WAVE_ROWS_CSV_PATH = path.join(DATA_DIR, 'review-needed-p1-third-wave-rows.csv');
const THIRD_WAVE_MD_PATH = path.join(DATA_DIR, 'review-needed-p1-third-wave.md');

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

function loadCsv(filePath: string) {
    return parseCsv(readFileSync(filePath, 'utf8'));
}

function escapeCsv(value: string) {
    if (/[",\n]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
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

function classifyBucket(site: SiteRow) {
    const localCount = toNumber(site.local_count ?? '') ?? 0;
    const matchedCameraCount = toNumber(site.matched_camera_count ?? '') ?? 0;
    const minDistanceM = toNumber(site.min_distance_m ?? '') ?? Number.POSITIVE_INFINITY;
    const maxScore = toNumber(site.max_score ?? '') ?? -1;

    if (matchedCameraCount < localCount) {
        return {
            bucket: 'count_short',
            reason: `official-count-smaller(local=${localCount}, official=${matchedCameraCount})`,
        };
    }

    if (matchedCameraCount > localCount) {
        if (minDistanceM <= 60 && maxScore >= 216) {
            return {
                bucket: 'count_surplus_but_strong',
                reason: `official-count-larger(local=${localCount}, official=${matchedCameraCount}) but strong distance/score`,
            };
        }
        return {
            bucket: 'count_surplus',
            reason: `official-count-larger(local=${localCount}, official=${matchedCameraCount})`,
        };
    }

    if (minDistanceM > 120) {
        return {
            bucket: 'distance_high',
            reason: `distance-high(${minDistanceM}m)`,
        };
    }

    if (minDistanceM > 80) {
        return {
            bucket: 'distance_moderate',
            reason: `distance-moderate(${minDistanceM}m)`,
        };
    }

    if (maxScore < 194) {
        return {
            bucket: 'score_low',
            reason: `score-low(${maxScore})`,
        };
    }

    return {
        bucket: 'third_wave_candidate',
        reason: `count-match, distance<=80m(${minDistanceM}), score>=194(${maxScore})`,
    };
}

function main() {
    mkdirSync(DATA_DIR, { recursive: true });
    const siteRows = loadCsv(P1_SITES_PATH) as SiteRow[];
    const rowRows = loadCsv(P1_ROWS_PATH) as RowRow[];
    const rowById = new Map(rowRows.map((row) => [(row.id ?? '').trim(), row]));

    const classifiedSites: ClassifiedSiteRow[] = siteRows.map((site) => {
        const classification = classifyBucket(site);
        return {
            bucket: classification.bucket,
            blocker_reason: classification.reason,
            ...site,
        };
    });

    const bucketHeaders = [
        'bucket',
        'blocker_reason',
        ...Object.keys(siteRows[0] ?? {}),
    ];

    const bucketCsv = [
        bucketHeaders.join(','),
        ...classifiedSites.map((row) => bucketHeaders.map((header) => escapeCsv(row[header as keyof ClassifiedSiteRow] ?? '')).join(',')),
    ].join('\n');
    writeFileSync(BUCKETS_CSV_PATH, `${bucketCsv}\n`, 'utf8');

    const thirdWaveSites = classifiedSites.filter((row) => row.bucket === 'third_wave_candidate');
    const thirdWaveIds = new Set(
        thirdWaveSites.flatMap((site) => splitLocalIds(site.local_ids ?? ''))
    );
    const thirdWaveRows = rowRows.filter((row) => thirdWaveIds.has((row.id ?? '').trim()));

    const siteHeaders = [
        'suggested_approve',
        'suggestion_reason',
        ...Object.keys(siteRows[0] ?? {}),
    ];
    const thirdWaveSitesCsv = [
        siteHeaders.join(','),
        ...thirdWaveSites.map((row) => siteHeaders.map((header) => {
            if (header === 'suggested_approve') return 'Y';
            if (header === 'suggestion_reason') return '3rd-wave-rule-pass';
            return escapeCsv(row[header.replace(/^suggested_approve$|^suggestion_reason$/, '')] ?? '');
        }).join(',')),
    ].join('\n');
    writeFileSync(THIRD_WAVE_SITES_CSV_PATH, `${thirdWaveSitesCsv}\n`, 'utf8');

    const rowHeaders = [
        'suggested_approve',
        'suggestion_reason',
        ...Object.keys(rowRows[0] ?? {}),
    ];
    const thirdWaveRowsCsv = [
        rowHeaders.join(','),
        ...thirdWaveRows.map((row) => rowHeaders.map((header) => {
            if (header === 'suggested_approve') return 'Y';
            if (header === 'suggestion_reason') return '3rd-wave-rule-pass';
            return escapeCsv(row[header.replace(/^suggested_approve$|^suggestion_reason$/, '')] ?? '');
        }).join(',')),
    ].join('\n');
    writeFileSync(THIRD_WAVE_ROWS_CSV_PATH, `${thirdWaveRowsCsv}\n`, 'utf8');

    const bucketCounts = classifiedSites.reduce<Record<string, number>>((acc, row) => {
        acc[row.bucket] = (acc[row.bucket] ?? 0) + 1;
        return acc;
    }, {});

    const lines = [
        '# P1 Remaining Buckets',
        '',
        `- generatedAt: ${new Date().toISOString()}`,
        `- remainingSites: ${siteRows.length}`,
        `- remainingRows: ${rowRows.length}`,
        `- thirdWaveSites: ${thirdWaveSites.length}`,
        `- thirdWaveRows: ${thirdWaveRows.length}`,
        '',
        '## Bucket Summary',
        '',
        ...Object.entries(bucketCounts)
            .sort((left, right) => left[0].localeCompare(right[0]))
            .map(([bucket, count]) => `- ${bucket}: ${count}`),
        '',
        '## Remaining Sites',
        '',
        '| Bucket | Region | MNG_NO | Local IDs | Score | Dist(m) | Reason |',
        '| --- | --- | --- | --- | ---: | ---: | --- |',
        ...classifiedSites.map((row) =>
            `| ${row.bucket} | ${row.region} | ${row.matched_mng_no} | ${splitLocalIds(row.local_ids ?? '').join(', ')} | ${row.max_score} | ${row.min_distance_m} | ${row.blocker_reason} |`
        ),
        '',
    ];

    writeFileSync(BUCKETS_MD_PATH, `${lines.join('\n')}\n`, 'utf8');
    writeFileSync(THIRD_WAVE_MD_PATH, `${[
        '# P1 Third Wave Candidates',
        '',
        `- generatedAt: ${new Date().toISOString()}`,
        `- thirdWaveSites: ${thirdWaveSites.length}`,
        `- thirdWaveRows: ${thirdWaveRows.length}`,
        '',
        ...(
            thirdWaveSites.length === 0
                ? ['- 현재 규칙으로는 3차 즉시 승격 후보가 없습니다.', '']
                : [
                    '| Region | MNG_NO | Local IDs | Score | Dist(m) |',
                    '| --- | --- | --- | ---: | ---: |',
                    ...thirdWaveSites.map((row) =>
                        `| ${row.region} | ${row.matched_mng_no} | ${splitLocalIds(row.local_ids ?? '').join(', ')} | ${row.max_score} | ${row.min_distance_m} |`
                    ),
                    '',
                ]
        ),
    ].join('\n')}\n`, 'utf8');

    console.log(JSON.stringify({
        input: {
            sites: P1_SITES_PATH,
            rows: P1_ROWS_PATH,
        },
        output: {
            bucketsCsv: BUCKETS_CSV_PATH,
            bucketsMarkdown: BUCKETS_MD_PATH,
            thirdWaveSitesCsv: THIRD_WAVE_SITES_CSV_PATH,
            thirdWaveRowsCsv: THIRD_WAVE_ROWS_CSV_PATH,
            thirdWaveMarkdown: THIRD_WAVE_MD_PATH,
        },
        summary: {
            remainingSites: siteRows.length,
            remainingRows: rowRows.length,
            bucketCounts,
            thirdWaveSites: thirdWaveSites.length,
            thirdWaveRows: thirdWaveRows.length,
        },
        thirdWaveSamples: thirdWaveSites.slice(0, 10).map((row) => ({
            region: row.region,
            matched_mng_no: row.matched_mng_no,
            local_ids: splitLocalIds(row.local_ids ?? ''),
            max_score: row.max_score,
            min_distance_m: row.min_distance_m,
        })),
    }, null, 2));
}

main();
