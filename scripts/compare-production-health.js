const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_HEALTH_URL = 'https://cctv-monitor.vercel.app/api/health';
const DEFAULT_CCTV_URL = 'https://cctv-monitor.vercel.app/api/cctv';
const DEFAULT_SNAPSHOT_PATH = path.resolve(process.cwd(), '.monitoring/production-health-summary.json');

function parseArgs(argv) {
    const args = {
        health: DEFAULT_HEALTH_URL,
        cctv: DEFAULT_CCTV_URL,
        snapshot: DEFAULT_SNAPSHOT_PATH,
        writeSnapshot: false,
        writeSnapshotIfClean: false,
        warnOnDrop: [],
        failOnDrop: [],
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const next = argv[index + 1];

        if (arg === '--health' && next) {
            args.health = next;
            index += 1;
            continue;
        }

        if (arg === '--cctv' && next) {
            args.cctv = next;
            index += 1;
            continue;
        }

        if (arg === '--snapshot' && next) {
            args.snapshot = path.resolve(process.cwd(), next);
            index += 1;
            continue;
        }

        if (arg === '--write-snapshot') {
            args.writeSnapshot = true;
            continue;
        }

        if (arg === '--write-snapshot-if-clean') {
            args.writeSnapshotIfClean = true;
            continue;
        }

        if (arg === '--warn-on-drop' && next) {
            args.warnOnDrop.push(next);
            index += 1;
            continue;
        }

        if (arg === '--fail-on-drop' && next) {
            args.failOnDrop.push(next);
            index += 1;
            continue;
        }
    }

    return args;
}

async function loadJson(source) {
    if (/^https?:\/\//i.test(source)) {
        const response = await fetch(source, {
            headers: {
                Accept: 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch ${source}: HTTP ${response.status}`);
        }

        return response.json();
    }

    return JSON.parse(fs.readFileSync(source, 'utf8'));
}

function sortObject(value) {
    return Object.fromEntries(
        Object.entries(value ?? {}).sort(([left], [right]) => left.localeCompare(right, 'ko'))
    );
}

function countBy(items, selector) {
    return items.reduce((acc, item) => {
        const key = selector(item);
        if (!key) {
            return acc;
        }

        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
    }, {});
}

function resolveCoordinateQuality(item) {
    if (item.coordinateSource === 'official') return 'official';
    if (item.coordinateVerified === true || item.coordinateSource === 'its_api') return 'verified';
    if (item.coordinateVerified === false || item.coordinateSource === 'seed') return 'approximate';
    return 'unknown';
}

function buildSummary(healthPayload, cctvItems) {
    const service = healthPayload?.services?.cctv ?? {};
    const trafficItems = cctvItems.filter((item) => item.type === 'traffic');

    return {
        checkedAt: healthPayload?.checkedAt ?? null,
        total: service.total ?? cctvItems.length,
        byRegion: sortObject(service.byRegion ?? countBy(cctvItems, (item) => item.region)),
        byType: sortObject(service.byType ?? countBy(cctvItems, (item) => item.type)),
        byCoordinateQuality: sortObject(
            service.byCoordinateQuality ?? countBy(cctvItems, (item) => resolveCoordinateQuality(item))
        ),
        bySource: sortObject(countBy(cctvItems, (item) => item.source ?? 'unknown')),
        trafficBySource: sortObject(countBy(trafficItems, (item) => item.source ?? 'unknown')),
        officialOverrideCount: service.officialOverrideCount ?? null,
        coordinateInputSummary: service.coordinateInputSummary ?? null,
    };
}

function diffCounters(previous = {}, current = {}) {
    const keys = Array.from(new Set([...Object.keys(previous), ...Object.keys(current)])).sort((a, b) => a.localeCompare(b, 'ko'));
    return keys
        .map((key) => {
            const before = previous[key] ?? 0;
            const after = current[key] ?? 0;
            const delta = after - before;
            return delta === 0 ? null : { key, before, after, delta };
        })
        .filter(Boolean);
}

function printCounter(label, counter) {
    console.log(`${label}: ${JSON.stringify(counter)}`);
}

function printDiff(label, previous, current) {
    const changes = diffCounters(previous, current);
    if (changes.length === 0) {
        console.log(`${label}: no changes`);
        return;
    }

    console.log(`${label}:`);
    changes.forEach((change) => {
        const sign = change.delta > 0 ? '+' : '';
        console.log(`  - ${change.key}: ${change.before} -> ${change.after} (${sign}${change.delta})`);
    });
}

function parseDropRule(value) {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
        return null;
    }

    const [rawSelector, rawThreshold] = normalized.split('=');
    const selector = rawSelector?.trim() ?? '';
    const threshold = rawThreshold ? Number(rawThreshold.trim()) : 1;
    if (!selector || !Number.isFinite(threshold) || threshold <= 0) {
        return null;
    }

    if (selector === 'total') {
        return { group: 'total', key: 'total', label: 'total', threshold };
    }

    const separatorIndex = selector.indexOf(':');
    if (separatorIndex === -1) {
        return null;
    }

    const group = selector.slice(0, separatorIndex).trim();
    const key = selector.slice(separatorIndex + 1).trim();
    if (!group || !key) {
        return null;
    }

    const supportedGroups = new Set(['region', 'type', 'coordinateQuality', 'trafficBySource', 'source']);
    if (!supportedGroups.has(group)) {
        return null;
    }

    return {
        group,
        key,
        label: `${group}:${key}`,
        threshold,
    };
}

function evaluateDropRules(rules, previous, current) {
    return rules
        .map(parseDropRule)
        .filter(Boolean)
        .map((rule) => {
            if (rule.group === 'total') {
                const before = previous.total ?? 0;
                const after = current.total ?? 0;
                return { ...rule, before, after, delta: after - before };
            }

            const previousCounter = previous[rule.group] ?? {};
            const currentCounter = current[rule.group] ?? {};
            const before = previousCounter[rule.key] ?? 0;
            const after = currentCounter[rule.key] ?? 0;
            return { ...rule, before, after, delta: after - before };
        })
        .filter((result) => result.delta <= -result.threshold);
}

async function run() {
    const args = parseArgs(process.argv.slice(2));
    const [healthPayload, cctvItems] = await Promise.all([
        loadJson(args.health),
        loadJson(args.cctv),
    ]);

    if (!Array.isArray(cctvItems)) {
        throw new Error('CCTV payload must be an array');
    }

    const summary = buildSummary(healthPayload, cctvItems);

    console.log(`checkedAt: ${summary.checkedAt}`);
    console.log(`total: ${summary.total}`);
    printCounter('byRegion', summary.byRegion);
    printCounter('byType', summary.byType);
    printCounter('byCoordinateQuality', summary.byCoordinateQuality);
    printCounter('trafficBySource', summary.trafficBySource);

    let hasWarnings = false;
    let hasFailures = false;

    if (fs.existsSync(args.snapshot)) {
        const previous = JSON.parse(fs.readFileSync(args.snapshot, 'utf8'));
        console.log(`snapshot: ${args.snapshot}`);
        printDiff('total delta', { total: previous.total ?? 0 }, { total: summary.total ?? 0 });
        printDiff('region delta', previous.byRegion, summary.byRegion);
        printDiff('type delta', previous.byType, summary.byType);
        printDiff('coordinateQuality delta', previous.byCoordinateQuality, summary.byCoordinateQuality);
        printDiff('trafficBySource delta', previous.trafficBySource, summary.trafficBySource);

        const previousForRules = {
            total: previous.total ?? 0,
            region: previous.byRegion ?? {},
            type: previous.byType ?? {},
            coordinateQuality: previous.byCoordinateQuality ?? {},
            trafficBySource: previous.trafficBySource ?? {},
            source: previous.bySource ?? {},
        };
        const currentForRules = {
            total: summary.total ?? 0,
            region: summary.byRegion ?? {},
            type: summary.byType ?? {},
            coordinateQuality: summary.byCoordinateQuality ?? {},
            trafficBySource: summary.trafficBySource ?? {},
            source: summary.bySource ?? {},
        };
        const warnings = evaluateDropRules(args.warnOnDrop, previousForRules, currentForRules);
        if (warnings.length > 0) {
            hasWarnings = true;
            console.warn('warn-on-drop violations:');
            warnings.forEach((violation) => {
                console.warn(`  - ${violation.label}: ${violation.before} -> ${violation.after} (${violation.delta}, threshold=${violation.threshold})`);
            });
        } else if (args.warnOnDrop.length > 0) {
            console.log('warn-on-drop: no violations');
        }

        const failures = evaluateDropRules(args.failOnDrop, previousForRules, currentForRules);
        if (failures.length > 0) {
            hasFailures = true;
            console.error('fail-on-drop violations:');
            failures.forEach((violation) => {
                console.error(`  - ${violation.label}: ${violation.before} -> ${violation.after} (${violation.delta}, threshold=${violation.threshold})`);
            });
            process.exitCode = 2;
        } else if (args.failOnDrop.length > 0) {
            console.log('fail-on-drop: no violations');
        }
    } else {
        console.log(`snapshot: ${args.snapshot} (missing)`);
    }

    if (args.writeSnapshot) {
        fs.mkdirSync(path.dirname(args.snapshot), { recursive: true });
        fs.writeFileSync(args.snapshot, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
        console.log(`snapshot updated: ${args.snapshot}`);
    } else if (args.writeSnapshotIfClean) {
        if (hasWarnings || hasFailures) {
            console.log(`snapshot skipped: ${args.snapshot} (not clean)`);
        } else {
            fs.mkdirSync(path.dirname(args.snapshot), { recursive: true });
            fs.writeFileSync(args.snapshot, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
            console.log(`snapshot updated: ${args.snapshot} (clean)`);
        }
    }

    console.log(`result: ${hasFailures ? 'fail' : hasWarnings ? 'warn' : 'clean'}`);
}

run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
