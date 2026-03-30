import path from 'path';
import {
    TEMPLATE_PATH,
    applyMatches,
    decodeInput,
    filterPublicRows,
    loadPublicRowsFromCsv,
    loadPublicRowsFromJson,
    loadTemplateRows,
    writeTemplateRows,
} from '../lib/public-standard-import';

function usage() {
    console.error('Usage: npx --yes tsx scripts/import-public-standard-cctv.ts <public-standard-path-or-url> [--dry-run]');
    process.exit(1);
}

function isRemoteInput(value: string) {
    return /^https?:\/\//i.test(value);
}

async function fetchRemoteBuffer(input: string) {
    const response = await fetch(input, {
        headers: {
            'user-agent': 'Mozilla/5.0 (compatible; CCTVMonitorImporter/1.0)',
            accept: 'application/json,text/csv,text/plain,*/*',
        },
        redirect: 'follow',
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch remote input: ${response.status} ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
}

function parsePublicRowsFromBuffer(buffer: Buffer) {
    const raw = decodeInput(buffer);
    const firstNonWhitespace = raw.trimStart()[0];
    const rows = firstNonWhitespace === '[' || firstNonWhitespace === '{'
        ? loadPublicRowsFromJson(raw)
        : loadPublicRowsFromCsv(raw);

    return filterPublicRows(rows);
}

async function loadPublicRows(input: string) {
    const buffer = isRemoteInput(input)
        ? await fetchRemoteBuffer(input)
        : await import('fs').then(({ readFileSync }) => readFileSync(path.resolve(process.cwd(), input)));

    return parsePublicRowsFromBuffer(buffer);
}

function localSourceDocument(input: string) {
    if (isRemoteInput(input)) {
        try {
            const url = new URL(input);
            const fromPath = path.basename(url.pathname);
            return fromPath || url.hostname;
        } catch {
            return input;
        }
    }

    return path.basename(path.resolve(process.cwd(), input));
}

async function main() {
    const [, , inputPath, ...rest] = process.argv;
    if (!inputPath) {
        usage();
    }

    const dryRun = rest.includes('--dry-run');
    const templateRows = loadTemplateRows();
    const publicRows = await loadPublicRows(inputPath);
    const sourceDocument = localSourceDocument(inputPath);
    const resolvedInput = isRemoteInput(inputPath)
        ? inputPath
        : path.resolve(process.cwd(), inputPath);

    const result = applyMatches(templateRows, publicRows, sourceDocument);

    if (!dryRun) {
        writeTemplateRows(result.updatedRows);
    }

    console.log(JSON.stringify({
        inputPath: resolvedInput,
        dryRun,
        publicRows: publicRows.length,
        candidateRows: result.candidateRows,
        matchedRows: result.matchedRows,
        outputPath: TEMPLATE_PATH,
    }, null, 2));
}

void main();
