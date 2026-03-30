import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import {
    CoordinateTemplateRow,
    HEADER,
    TEMPLATE_PATH,
    loadTemplateRows,
    splitCsvLine,
    writeTemplateRows,
} from '../lib/public-standard-import';

type ApprovalRow = Record<string, string>;

type ApprovalSource = 'site' | 'row';

type ApprovalDecision = {
    id: string;
    source: ApprovalSource;
    checkedNote: string;
};

const DATA_DIR = path.join(process.cwd(), 'data');
const SITE_APPROVALS_PATH = path.join(DATA_DIR, 'review-needed-p1-sites.csv');
const ROW_APPROVALS_PATH = path.join(DATA_DIR, 'review-needed-p1-rows.csv');
const SUMMARY_JSON_PATH = path.join(DATA_DIR, 'reviewed-promotions-summary.json');
const SUMMARY_MD_PATH = path.join(DATA_DIR, 'reviewed-promotions-summary.md');

function usage() {
    console.error('Usage: npx --yes tsx scripts/apply-reviewed-promotions.ts [--apply]');
    process.exit(1);
}

function parseCsv(raw: string) {
    const lines = raw
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0);

    if (lines.length === 0) {
        return [] as ApprovalRow[];
    }

    const headers = splitCsvLine(lines[0]);
    return lines.slice(1).map((line) => {
        const cells = splitCsvLine(line);
        return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
    });
}

function loadOptionalCsv(filePath: string) {
    if (!existsSync(filePath)) {
        return [] as ApprovalRow[];
    }

    return parseCsv(readFileSync(filePath, 'utf8'));
}

function isApproved(value: string) {
    const normalized = (value ?? '').trim().toUpperCase();
    return normalized === 'Y'
        || normalized === 'YES'
        || normalized === 'TRUE'
        || normalized === '1'
        || normalized === 'APPROVE';
}

function splitLocalIds(value: string) {
    return value
        .split('|')
        .map((part) => part.trim())
        .filter(Boolean);
}

function buildApprovalDecisions(siteRows: ApprovalRow[], rowRows: ApprovalRow[]) {
    const decisions = new Map<string, ApprovalDecision[]>();

    function push(id: string, source: ApprovalSource, checkedNote: string) {
        if (!decisions.has(id)) {
            decisions.set(id, []);
        }
        decisions.get(id)!.push({ id, source, checkedNote: checkedNote.trim() });
    }

    siteRows
        .filter((row) => isApproved(row.approve ?? ''))
        .forEach((row) => {
            splitLocalIds(row.local_ids ?? '').forEach((id) => {
                push(id, 'site', row.checked_note ?? '');
            });
        });

    rowRows
        .filter((row) => isApproved(row.approve ?? ''))
        .forEach((row) => {
            const id = (row.id ?? '').trim();
            if (id) {
                push(id, 'row', row.checked_note ?? '');
            }
        });

    return decisions;
}

function uniq(values: string[]) {
    return Array.from(new Set(values.filter(Boolean)));
}

function buildPromotionNote(row: CoordinateTemplateRow, decisions: ApprovalDecision[]) {
    const sourcePart = uniq(decisions.map((decision) => decision.source)).join('+') || 'manual';
    const noteParts = uniq(decisions.map((decision) => decision.checkedNote)).filter(Boolean);
    const meta = [
        'P1 수동 승인 승격',
        row.matched_mng_no ? `mng=${row.matched_mng_no}` : '',
        row.matched_score ? `score=${row.matched_score}` : '',
        row.matched_distance_m ? `dist=${row.matched_distance_m}m` : '',
        `source=${sourcePart}`,
        noteParts.length > 0 ? `checked=${noteParts.join(' / ')}` : '',
    ].filter(Boolean);
    return meta.join(', ');
}

function promotionEligible(row: CoordinateTemplateRow) {
    return (row.status === 'review_needed' || row.status === 'review')
        && Boolean(row.lat)
        && Boolean(row.lng)
        && Boolean(row.matched_mng_no);
}

function writeSummaryMarkdown(summary: {
    dryRun: boolean;
    approvedIds: string[];
    promotedRows: CoordinateTemplateRow[];
    skippedRows: { id: string; reason: string }[];
    appliedSources: Record<ApprovalSource, number>;
}) {
    const lines = [
        '# Reviewed Promotion Summary',
        '',
        `- generatedAt: ${new Date().toISOString()}`,
        `- mode: ${summary.dryRun ? 'dry-run' : 'apply'}`,
        `- approvedIds: ${summary.approvedIds.length}`,
        `- promotedRows: ${summary.promotedRows.length}`,
        `- skippedRows: ${summary.skippedRows.length}`,
        `- sources: site=${summary.appliedSources.site}, row=${summary.appliedSources.row}`,
        '',
        '## Promoted',
        '',
        '| ID | Name | Region | MNG_NO | Score | Dist(m) |',
        '| --- | --- | --- | --- | ---: | ---: |',
        ...summary.promotedRows.slice(0, 50).map((row) =>
            `| ${row.id} | ${row.name} | ${row.region} | ${row.matched_mng_no ?? '-'} | ${row.matched_score ?? '-'} | ${row.matched_distance_m ?? '-'} |`
        ),
        '',
    ];

    if (summary.skippedRows.length > 0) {
        lines.push('## Skipped', '', '| ID | Reason |', '| --- | --- |');
        summary.skippedRows.slice(0, 50).forEach((row) => {
            lines.push(`| ${row.id} | ${row.reason} |`);
        });
        lines.push('');
    }

    writeFileSync(SUMMARY_MD_PATH, `${lines.join('\n')}\n`, 'utf8');
}

function main() {
    const rest = process.argv.slice(2);
    if (rest.some((arg) => arg === '--help' || arg === '-h')) {
        usage();
    }

    const apply = rest.includes('--apply');
    mkdirSync(DATA_DIR, { recursive: true });

    const siteRows = loadOptionalCsv(SITE_APPROVALS_PATH);
    const rowRows = loadOptionalCsv(ROW_APPROVALS_PATH);
    const decisionsById = buildApprovalDecisions(siteRows, rowRows);
    const templateRows = loadTemplateRows();

    const approvedIds = Array.from(decisionsById.keys()).sort();
    const promotedRows: CoordinateTemplateRow[] = [];
    const skippedRows: { id: string; reason: string }[] = [];
    const appliedSources: Record<ApprovalSource, number> = { site: 0, row: 0 };

    const nextRows = templateRows.map((row) => {
        const decisions = decisionsById.get(row.id);
        if (!decisions) {
            return row;
        }

        decisions.forEach((decision) => {
            appliedSources[decision.source] += 1;
        });

        if (!promotionEligible(row)) {
            skippedRows.push({
                id: row.id,
                reason: `status=${row.status || 'empty'}, lat=${row.lat ? 'Y' : 'N'}, lng=${row.lng ? 'Y' : 'N'}, matched_mng_no=${row.matched_mng_no ? 'Y' : 'N'}`,
            });
            return row;
        }

        const promoted = {
            ...row,
            status: 'active',
            source_document: row.source_document || '행정안전부_CCTV정보 조회서비스',
            note: buildPromotionNote(row, decisions),
        } satisfies CoordinateTemplateRow;
        promotedRows.push(promoted);
        return promoted;
    });

    if (apply && promotedRows.length > 0) {
        writeTemplateRows(nextRows);
    }

    const summary = {
        dryRun: !apply,
        templatePath: TEMPLATE_PATH,
        siteApprovalsPath: SITE_APPROVALS_PATH,
        rowApprovalsPath: ROW_APPROVALS_PATH,
        approvedIds,
        promotedRows: promotedRows.map((row) => ({
            id: row.id,
            name: row.name,
            region: row.region,
            matched_mng_no: row.matched_mng_no ?? '',
            matched_score: row.matched_score ?? '',
            matched_distance_m: row.matched_distance_m ?? '',
            note: row.note,
        })),
        skippedRows,
        appliedSources,
        outputColumns: HEADER,
    };

    writeFileSync(SUMMARY_JSON_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    writeSummaryMarkdown({
        dryRun: !apply,
        approvedIds,
        promotedRows,
        skippedRows,
        appliedSources,
    });

    console.log(JSON.stringify(summary, null, 2));
}

main();
