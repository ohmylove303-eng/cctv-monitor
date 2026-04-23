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

    if (fs.existsSync(args.snapshot)) {
        const previous = JSON.parse(fs.readFileSync(args.snapshot, 'utf8'));
        console.log(`snapshot: ${args.snapshot}`);
        printDiff('total delta', { total: previous.total ?? 0 }, { total: summary.total ?? 0 });
        printDiff('region delta', previous.byRegion, summary.byRegion);
        printDiff('type delta', previous.byType, summary.byType);
        printDiff('coordinateQuality delta', previous.byCoordinateQuality, summary.byCoordinateQuality);
        printDiff('trafficBySource delta', previous.trafficBySource, summary.trafficBySource);
    } else {
        console.log(`snapshot: ${args.snapshot} (missing)`);
    }

    if (args.writeSnapshot) {
        fs.mkdirSync(path.dirname(args.snapshot), { recursive: true });
        fs.writeFileSync(args.snapshot, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
        console.log(`snapshot updated: ${args.snapshot}`);
    }
}

run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
