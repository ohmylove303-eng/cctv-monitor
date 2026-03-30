import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import {
    CoordinateTemplateRow,
    HEADER,
    loadTemplateRows,
} from '../lib/public-standard-import';

type ReviewGroup = {
    key: string;
    region: string;
    source: string;
    matchedMngNo: string;
    matchedManager: string;
    matchedPurpose: string;
    matchedAddress: string;
    matchedCameraCount: number | null;
    localCount: number;
    localIds: string[];
    localNames: string[];
    localAddresses: string[];
    minDistanceM: number | null;
    maxScore: number | null;
    minScore: number | null;
    priority: 'P1' | 'P2' | 'P3' | 'P4';
    recommendation: string;
};

const OUTPUT_DIR = path.join(process.cwd(), 'data');
const CSV_PATH = path.join(OUTPUT_DIR, 'review-needed-priority.csv');
const MD_PATH = path.join(OUTPUT_DIR, 'review-needed-priority.md');

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

function priorityOf(score: number | null, distanceM: number | null): ReviewGroup['priority'] {
    if (score !== null && distanceM !== null && score >= 190 && distanceM <= 150) return 'P1';
    if (score !== null && distanceM !== null && score >= 150 && distanceM <= 500) return 'P2';
    if (score !== null && distanceM !== null && score >= 110 && distanceM <= 1000) return 'P3';
    return 'P4';
}

function recommendationOf(priority: ReviewGroup['priority']) {
    if (priority === 'P1') return '문서 대조 후 우선 승격 검토';
    if (priority === 'P2') return '지도/거리/기관명 교차확인 후 승격 검토';
    if (priority === 'P3') return '행안부 주소와 원본 문서 추가 확인 필요';
    return '원본 매핑표 또는 현장 근거 없이는 승격 금지';
}

function groupKey(row: CoordinateTemplateRow) {
    return [
        row.region,
        row.source,
        row.matched_mng_no || row.matched_address || row.address,
        row.address,
    ].join('|');
}

function buildGroups(rows: CoordinateTemplateRow[]) {
    const reviewRows = rows.filter((row) => row.status === 'review_needed');
    const byKey = new Map<string, CoordinateTemplateRow[]>();

    reviewRows.forEach((row) => {
        const key = groupKey(row);
        if (!byKey.has(key)) {
            byKey.set(key, []);
        }
        byKey.get(key)!.push(row);
    });

    const groups: ReviewGroup[] = Array.from(byKey.entries()).map(([key, groupRows]) => {
        const distances = groupRows
            .map((row) => toNumber(row.matched_distance_m ?? ''))
            .filter((value): value is number => value !== null);
        const scores = groupRows
            .map((row) => toNumber(row.matched_score ?? ''))
            .filter((value): value is number => value !== null);
        const matchedCameraCounts = groupRows
            .map((row) => toNumber(row.matched_camera_count ?? ''))
            .filter((value): value is number => value !== null);
        const maxScore = scores.length > 0 ? Math.max(...scores) : null;
        const minScore = scores.length > 0 ? Math.min(...scores) : null;
        const minDistanceM = distances.length > 0 ? Math.min(...distances) : null;
        const priority = priorityOf(maxScore, minDistanceM);

        return {
            key,
            region: groupRows[0].region,
            source: groupRows[0].source,
            matchedMngNo: groupRows[0].matched_mng_no ?? '',
            matchedManager: groupRows[0].matched_manager ?? '',
            matchedPurpose: groupRows[0].matched_purpose ?? '',
            matchedAddress: groupRows[0].matched_address ?? '',
            matchedCameraCount: matchedCameraCounts.length > 0 ? Math.max(...matchedCameraCounts) : null,
            localCount: groupRows.length,
            localIds: groupRows.map((row) => row.id),
            localNames: Array.from(new Set(groupRows.map((row) => row.name))),
            localAddresses: Array.from(new Set(groupRows.map((row) => row.address))),
            minDistanceM,
            maxScore,
            minScore,
            priority,
            recommendation: recommendationOf(priority),
        };
    });

    groups.sort((left, right) => {
        const priorityRank = { P1: 1, P2: 2, P3: 3, P4: 4 };
        return priorityRank[left.priority] - priorityRank[right.priority]
            || (right.maxScore ?? -1) - (left.maxScore ?? -1)
            || (left.minDistanceM ?? Number.POSITIVE_INFINITY) - (right.minDistanceM ?? Number.POSITIVE_INFINITY)
            || left.region.localeCompare(right.region, 'ko')
            || left.localIds[0].localeCompare(right.localIds[0]);
    });

    return groups;
}

function writeCsv(groups: ReviewGroup[]) {
    const headers = [
        'priority',
        'region',
        'source',
        'matched_mng_no',
        'matched_manager',
        'matched_purpose',
        'matched_address',
        'matched_camera_count',
        'local_count',
        'min_distance_m',
        'max_score',
        'min_score',
        'recommendation',
        'local_ids',
        'local_names',
        'local_addresses',
    ];

    const csv = [
        headers.join(','),
        ...groups.map((group) => [
            group.priority,
            group.region,
            group.source,
            group.matchedMngNo,
            group.matchedManager,
            group.matchedPurpose,
            group.matchedAddress,
            group.matchedCameraCount === null ? '' : String(group.matchedCameraCount),
            String(group.localCount),
            group.minDistanceM === null ? '' : String(group.minDistanceM),
            group.maxScore === null ? '' : String(group.maxScore),
            group.minScore === null ? '' : String(group.minScore),
            group.recommendation,
            group.localIds.join(' | '),
            group.localNames.join(' | '),
            group.localAddresses.join(' | '),
        ].map(escapeCsv).join(',')),
    ].join('\n');

    writeFileSync(CSV_PATH, `${csv}\n`, 'utf8');
}

function writeMarkdown(groups: ReviewGroup[]) {
    const counts = groups.reduce<Record<string, number>>((acc, group) => {
        acc[group.priority] = (acc[group.priority] ?? 0) + 1;
        return acc;
    }, {});

    const lines: string[] = [
        '# Review Needed Priority Report',
        '',
        `- generatedAt: ${new Date().toISOString()}`,
        `- reviewRows: ${groups.reduce((sum, group) => sum + group.localCount, 0)}`,
        `- reviewSites: ${groups.length}`,
        `- prioritySummary: P1=${counts.P1 ?? 0}, P2=${counts.P2 ?? 0}, P3=${counts.P3 ?? 0}, P4=${counts.P4 ?? 0}`,
        '',
        '## Top 30 Sites',
        '',
        '| Priority | Region | Local Count | MNG_NO | Score | Dist(m) | Purpose | Official Address | Recommendation |',
        '| --- | --- | ---: | --- | ---: | ---: | --- | --- | --- |',
    ];

    groups.slice(0, 30).forEach((group) => {
        lines.push(
            `| ${group.priority} | ${group.region} | ${group.localCount} | ${group.matchedMngNo || '-'} | ${group.maxScore ?? '-'} | ${group.minDistanceM ?? '-'} | ${group.matchedPurpose || '-'} | ${group.matchedAddress || '-'} | ${group.recommendation} |`
        );
    });

    lines.push('', '## Review Rule', '', '- `P1`: 문서 대조 후 우선 승격 검토', '- `P2`: 지도/거리/기관명 교차확인 후 승격 검토', '- `P3`: 행안부 주소와 원본 문서 추가 확인 필요', '- `P4`: 원본 매핑표 또는 현장 근거 없이는 승격 금지', '');

    writeFileSync(MD_PATH, `${lines.join('\n')}\n`, 'utf8');
}

function main() {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const rows = loadTemplateRows();
    const groups = buildGroups(rows);

    writeCsv(groups);
    writeMarkdown(groups);

    const summary = groups.reduce<Record<string, number>>((acc, group) => {
        acc[group.priority] = (acc[group.priority] ?? 0) + 1;
        return acc;
    }, {});

    console.log(JSON.stringify({
        inputPath: path.join(process.cwd(), 'data', 'official-cctv-coordinates.csv'),
        csvPath: CSV_PATH,
        markdownPath: MD_PATH,
        reviewRows: rows.filter((row) => row.status === 'review_needed').length,
        reviewSites: groups.length,
        prioritySummary: summary,
        topSamples: groups.slice(0, 10).map((group) => ({
            priority: group.priority,
            region: group.region,
            matched_mng_no: group.matchedMngNo,
            local_ids: group.localIds,
            max_score: group.maxScore,
            min_distance_m: group.minDistanceM,
        })),
    }, null, 2));
}

main();
