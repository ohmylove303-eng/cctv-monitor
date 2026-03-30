import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

type Row = Record<string, string>;
type SiteReviewRow = Row & {
    decision: string;
    review_note: string;
    possible_explanation: string;
    next_action: string;
};
type RowReviewRow = {
    site_mng_no: string;
    local_id: string;
    local_name: string;
    local_address: string;
};

const DATA_DIR = path.join(process.cwd(), 'data');
const BUCKETS_PATH = path.join(DATA_DIR, 'review-needed-p1-remaining-buckets.csv');
const SITES_OUT_PATH = path.join(DATA_DIR, 'count-short-review-sites.csv');
const ROWS_OUT_PATH = path.join(DATA_DIR, 'count-short-review-rows.csv');
const MD_OUT_PATH = path.join(DATA_DIR, 'count-short-review.md');

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
        return [] as Row[];
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

function splitLocalIds(value: string) {
    return (value ?? '')
        .split('|')
        .map((part) => part.trim())
        .filter(Boolean);
}

function loadRows(filePath: string) {
    return parseCsv(readFileSync(filePath, 'utf8'));
}

function explanationFor(row: Row) {
    const officialCount = Number(row.matched_camera_count ?? '0');
    const localCount = Number(row.local_count ?? '0');

    if (officialCount === 1 && localCount === 3) {
        return '로컬 시드 3개가 실제 1개 CCTV를 과분할했을 가능성이 큼';
    }
    if (officialCount === 2 && localCount === 3) {
        return '로컬 시드 3개 중 1개가 중복이거나, 공식 원본에 1개 누락일 가능성';
    }
    return '시드 중복 가능성 검토 필요';
}

function main() {
    mkdirSync(DATA_DIR, { recursive: true });

    const bucketRows = loadRows(BUCKETS_PATH).filter((row) => row.bucket === 'count_short');

    const siteHeaders = [
        'decision',
        'review_note',
        'possible_explanation',
        'next_action',
        ...Object.keys(bucketRows[0] ?? {}),
    ];

    const siteOutRows: SiteReviewRow[] = bucketRows.map((row) => ({
        decision: '',
        review_note: '',
        possible_explanation: explanationFor(row),
        next_action: '문서/지도 대조 후 active 또는 keep_hidden',
        ...row,
    }));

    const siteCsv = [
        siteHeaders.join(','),
        ...siteOutRows.map((row) => siteHeaders.map((header) => escapeCsv(row[header as keyof SiteReviewRow] ?? '')).join(',')),
    ].join('\n');
    writeFileSync(SITES_OUT_PATH, `${siteCsv}\n`, 'utf8');

    const rowHeaders = [
        'site_mng_no',
        'local_id',
        'local_name',
        'local_address',
    ];
    const rowOut: RowReviewRow[] = bucketRows.flatMap((row) =>
        splitLocalIds(row.local_ids ?? '').map((id, index) => ({
            site_mng_no: row.matched_mng_no ?? '',
            local_id: id,
            local_name: (row.local_names ?? '').split('|').map((part) => part.trim())[index] ?? '',
            local_address: (row.local_addresses ?? '').split('|').map((part) => part.trim())[0] ?? '',
        }))
    );
    const rowCsv = [
        rowHeaders.join(','),
        ...rowOut.map((row) => rowHeaders.map((header) => escapeCsv(row[header as keyof RowReviewRow] ?? '')).join(',')),
    ].join('\n');
    writeFileSync(ROWS_OUT_PATH, `${rowCsv}\n`, 'utf8');

    const lines = [
        '# Count-Short Review Packet',
        '',
        `- generatedAt: ${new Date().toISOString()}`,
        `- sites: ${bucketRows.length}`,
        `- rows: ${rowOut.length}`,
        '',
        '## Review Goal',
        '',
        '- 로컬 시드 중복인지, 공식 원본 누락인지 판단',
        '- 확실하면 `active`, 애매하면 `keep_hidden` 유지',
        '',
        '## Sites',
        '',
        '| Region | MNG_NO | Local IDs | Official Count | Local Count | Dist(m) | Explanation |',
        '| --- | --- | --- | ---: | ---: | ---: | --- |',
        ...siteOutRows.map((row) =>
            `| ${row.region} | ${row.matched_mng_no} | ${splitLocalIds(row.local_ids ?? '').join(', ')} | ${row.matched_camera_count} | ${row.local_count} | ${row.min_distance_m} | ${row.possible_explanation} |`
        ),
        '',
    ];

    writeFileSync(MD_OUT_PATH, `${lines.join('\n')}\n`, 'utf8');

    console.log(JSON.stringify({
        input: BUCKETS_PATH,
        output: {
            sites: SITES_OUT_PATH,
            rows: ROWS_OUT_PATH,
            markdown: MD_OUT_PATH,
        },
        summary: {
            sites: bucketRows.length,
            rows: rowOut.length,
        },
    }, null, 2));
}

main();
