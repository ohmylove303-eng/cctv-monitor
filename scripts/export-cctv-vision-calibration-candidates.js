const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CCTV_SOURCE = 'https://cctv-monitor.vercel.app/api/cctv';
const DATA_DIR = path.resolve(process.cwd(), 'data');
const OUTPUT_CSV = path.join(DATA_DIR, 'cctv-vision-calibration-candidates.csv');
const OUTPUT_MD = path.join(DATA_DIR, 'cctv-vision-calibration-candidates.md');
const OUTPUT_REVIEW_SEED = path.join(DATA_DIR, 'cctv-vision-calibration-review-seed.csv');

const LIVE_TRAFFIC_SOURCES = new Set([
    'National-ITS',
    'GG_KTICT',
    'gimpo-its-main',
    'gimpo-its-cross',
    'incheon-utic',
]);
const HIGH_TOKENS = [
    '교차로', '사거리', '오거리', '삼거리', 'ic', 'jc', 'tg', '톨게이트',
    '램프', '진입', '진출', '입구', '출구', '분기점', '로터리',
];
const MEDIUM_TOKENS = ['교', '대교', '고가', '지하차도', '시점', '종점'];
const CANDIDATE_HEADERS = [
    'rank',
    'cctvId',
    'cctvName',
    'region',
    'source',
    'address',
    'suggestedReviewTier',
    'suggestedIdentificationUse',
    'suggestedDirectionStatus',
    'suggestionScore',
    'suggestionReason',
    'streamUrl',
];
const REVIEW_SEED_HEADERS = [
    'reviewStatus',
    'cctvId',
    'cctvName',
    'region',
    'visionTier',
    'identificationUse',
    'approachDistanceMeters',
    'resolutionWidth',
    'resolutionHeight',
    'directionCalibrationStatus',
    'lineZoneForward',
    'lineZoneReverse',
    'evidenceSource',
    'verificationMethod',
    'sampleCount',
    'datasetPath',
    'reviewer',
    'reviewedAt',
    'notes',
];

function parseArgs(argv) {
    const options = {
        cctvSource: DEFAULT_CCTV_SOURCE,
        limit: 40,
        perSource: 16,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--cctv') {
            options.cctvSource = argv[++index];
        } else if (arg === '--limit') {
            options.limit = Number(argv[++index]);
        } else if (arg === '--per-source') {
            options.perSource = Number(argv[++index]);
        } else if (arg === '--help' || arg === '-h') {
            console.log('Usage: node scripts/export-cctv-vision-calibration-candidates.js [--cctv <url-or-file>] [--limit 40] [--per-source 16]');
            process.exit(0);
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!Number.isInteger(options.limit) || options.limit <= 0) {
        throw new Error('--limit must be a positive integer');
    }
    if (!Number.isInteger(options.perSource) || options.perSource < 0) {
        throw new Error('--per-source must be a non-negative integer');
    }
    return options;
}

async function loadJson(source) {
    if (/^https?:\/\//i.test(source)) {
        const response = await fetch(source, {
            headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch ${source}: HTTP ${response.status}`);
        }
        return response.json();
    }

    return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), source), 'utf8'));
}

function escapeCsv(value) {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function normalizeText(value) {
    return String(value ?? '')
        .toLowerCase()
        .replace(/[()_\-.,·[\]]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function hasLiveStream(camera) {
    return Boolean(camera.hlsUrl || camera.streamUrl);
}

function scoreCandidate(camera) {
    const normalized = normalizeText(`${camera.name} ${camera.address}`);
    const raw = `${camera.name ?? ''} ${camera.address ?? ''}`.toLowerCase();
    const reasons = [];
    let score = 30;

    const highToken = HIGH_TOKENS.find((token) => normalized.includes(token));
    if (highToken) {
        score += 30;
        reasons.push(`near-token:${highToken}`);
    }

    const mediumToken = MEDIUM_TOKENS.find((token) => normalized.includes(token));
    if (mediumToken && mediumToken !== highToken) {
        score += 8;
        reasons.push(`structure-token:${mediumToken}`);
    }

    if (camera.source === 'gimpo-its-cross') {
        score += 18;
        reasons.push('source:gimpo-cross');
    } else if (camera.source === 'incheon-utic') {
        score += 14;
        reasons.push('source:incheon-utic');
    } else if (camera.source === 'gimpo-its-main') {
        score += 6;
        reasons.push('source:gimpo-main');
    } else if (camera.source === 'National-ITS') {
        score += 4;
        reasons.push('source:national-its');
    }

    if (/\d+(?:\.\d+)?k\b/i.test(raw)) {
        score -= 22;
        reasons.push('distance-marker-mainline');
    }
    if (raw.includes('상부') || raw.includes('하부')) {
        score -= 8;
        reasons.push('possible-distant-view');
    }

    const clamped = Math.max(0, Math.min(100, score));
    let suggestedReviewTier = 'tier_c_review_candidate';
    let suggestedIdentificationUse = 'traffic_flow_only_after_sample_verification';
    if (clamped >= 72) {
        suggestedReviewTier = 'tier_a_review_candidate';
        suggestedIdentificationUse = 'fine_grained_vehicle_after_sample_verification';
    } else if (clamped >= 52) {
        suggestedReviewTier = 'tier_b_review_candidate';
        suggestedIdentificationUse = 'vehicle_shape_direction_after_sample_verification';
    }

    return {
        score: clamped,
        suggestedReviewTier,
        suggestedIdentificationUse,
        suggestedDirectionStatus: 'pending_review',
        suggestionReason: reasons.join('; ') || 'live-traffic-candidate',
    };
}

function candidateRow(candidate, index) {
    return {
        rank: String(index + 1),
        cctvId: candidate.id,
        cctvName: candidate.name,
        region: candidate.region,
        source: candidate.source,
        address: candidate.address,
        suggestedReviewTier: candidate.suggestedReviewTier,
        suggestedIdentificationUse: candidate.suggestedIdentificationUse,
        suggestedDirectionStatus: candidate.suggestedDirectionStatus,
        suggestionScore: String(candidate.score),
        suggestionReason: candidate.suggestionReason,
        streamUrl: candidate.hlsUrl || candidate.streamUrl || '',
    };
}

function reviewSeedRow(candidate) {
    return {
        reviewStatus: 'review_needed',
        cctvId: candidate.id,
        cctvName: candidate.name,
        region: candidate.region,
        visionTier: '',
        identificationUse: '',
        approachDistanceMeters: '',
        resolutionWidth: '',
        resolutionHeight: '',
        directionCalibrationStatus: '',
        lineZoneForward: '',
        lineZoneReverse: '',
        evidenceSource: '',
        verificationMethod: '',
        sampleCount: '',
        datasetPath: '',
        reviewer: '',
        reviewedAt: '',
        notes: `candidate=${candidate.suggestedReviewTier}; score=${candidate.score}; reason=${candidate.suggestionReason}`,
    };
}

function writeCsv(filePath, headers, rows) {
    const csv = [
        headers.join(','),
        ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(',')),
    ].join('\n');
    fs.writeFileSync(filePath, `${csv}\n`, 'utf8');
}

async function run() {
    const options = parseArgs(process.argv.slice(2));
    fs.mkdirSync(DATA_DIR, { recursive: true });

    const payload = await loadJson(options.cctvSource);
    if (!Array.isArray(payload)) {
        throw new Error('CCTV source must be a JSON array');
    }

    const rankedCandidates = payload
        .filter((camera) => camera.type === 'traffic' && LIVE_TRAFFIC_SOURCES.has(camera.source) && hasLiveStream(camera))
        .map((camera) => ({
            ...camera,
            ...scoreCandidate(camera),
        }))
        .sort((left, right) =>
            right.score - left.score
            || String(left.region).localeCompare(String(right.region), 'ko')
            || String(left.name).localeCompare(String(right.name), 'ko')
        );
    const sourceCounts = new Map();
    const candidates = [];
    for (const candidate of rankedCandidates) {
        const source = candidate.source ?? 'unknown';
        const count = sourceCounts.get(source) ?? 0;
        if (options.perSource > 0 && count >= options.perSource) {
            continue;
        }
        sourceCounts.set(source, count + 1);
        candidates.push(candidate);
        if (candidates.length >= options.limit) {
            break;
        }
    }

    const candidateRows = candidates.map(candidateRow);
    const reviewSeedRows = candidates.map(reviewSeedRow);
    writeCsv(OUTPUT_CSV, CANDIDATE_HEADERS, candidateRows);
    writeCsv(OUTPUT_REVIEW_SEED, REVIEW_SEED_HEADERS, reviewSeedRows);

    const tierCounts = candidates.reduce((acc, candidate) => {
        acc[candidate.suggestedReviewTier] = (acc[candidate.suggestedReviewTier] ?? 0) + 1;
        return acc;
    }, {});
    const lines = [
        '# CCTV Vision Calibration Candidates',
        '',
        `- generatedAt: ${new Date().toISOString()}`,
        `- source: ${options.cctvSource}`,
        `- perSourceLimit: ${options.perSource === 0 ? 'none' : options.perSource}`,
        `- totalLiveTrafficInput: ${payload.filter((camera) => camera.type === 'traffic' && LIVE_TRAFFIC_SOURCES.has(camera.source) && hasLiveStream(camera)).length}`,
        `- exportedCandidates: ${candidates.length}`,
        `- tierAReviewCandidates: ${tierCounts.tier_a_review_candidate ?? 0}`,
        `- tierBReviewCandidates: ${tierCounts.tier_b_review_candidate ?? 0}`,
        `- tierCReviewCandidates: ${tierCounts.tier_c_review_candidate ?? 0}`,
        '',
        '## Rule',
        '',
        '- 이 파일은 후보 추천이며 운영 `active` 승격이 아니다.',
        '- 실제 승격은 샘플 프레임, 거리, 해상도, line zone, 리뷰어, 리뷰 일자가 채워진 뒤 `vision-calibration:promote`로만 가능하다.',
        '- Tier-A 후보도 검증 전까지는 `review_needed` 상태다.',
        '',
        '## Top Candidates',
        '',
        '| Rank | Region | ID | Name | Source | Suggested | Score | Reason |',
        '| ---: | --- | --- | --- | --- | --- | ---: | --- |',
        ...candidateRows.slice(0, 25).map((row) =>
            `| ${row.rank} | ${row.region} | ${row.cctvId} | ${row.cctvName} | ${row.source} | ${row.suggestedReviewTier} | ${row.suggestionScore} | ${row.suggestionReason} |`
        ),
        '',
    ];
    fs.writeFileSync(OUTPUT_MD, `${lines.join('\n')}\n`, 'utf8');

    console.log(JSON.stringify({
        input: options.cctvSource,
        output: {
            candidates: OUTPUT_CSV,
            reviewSeed: OUTPUT_REVIEW_SEED,
            markdown: OUTPUT_MD,
        },
        summary: {
            exportedCandidates: candidates.length,
            tierCounts,
            topIds: candidates.slice(0, 10).map((candidate) => candidate.id),
        },
    }, null, 2));
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
