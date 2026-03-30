import type { CctvItem } from '@/types/cctv';

const LOCAL_OFFICIAL_TRAFFIC_SOURCES = new Set([
    'gimpo-its-main',
    'gimpo-its-cross',
    'incheon-utic',
]);

const NATIONAL_TRAFFIC_SOURCES = new Set([
    'National-ITS',
    'GG_KTICT',
]);

const MANUAL_HIDDEN_RULES = [
    { source: 'National-ITS', name: '[경인선] 부평' },
    { source: 'National-ITS', name: '[경인선] 효성' },
] as const;

const SUSPECT_LOCAL_OFFICIAL_NEARBY_METERS = 150;
const SUSPECT_SAME_FEED_TRAFFIC_DUPLICATE_METERS = 25;

function normalizeText(value: string) {
    return value
        .toLowerCase()
        .replace(/\[[^\]]+\]/g, ' ')
        .replace(/[()_\-.,·]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeTrafficName(value: string) {
    return normalizeText(value)
        .replace(/(서울|인천|김포|강화|검단|한강로)\s*방향/g, ' ')
        .replace(/(서탑상부|동탑상부|상부|하부)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function haversineMeters(a: Pick<CctvItem, 'lat' | 'lng'>, b: Pick<CctvItem, 'lat' | 'lng'>) {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const earthRadiusMeters = 6371000;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const q =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;

    return 2 * earthRadiusMeters * Math.asin(Math.sqrt(q));
}

function isCrossFeedTrafficPair(a: CctvItem, b: CctvItem) {
    const sources = [a.source ?? '', b.source ?? ''];
    const hasLocalOfficial = sources.some((source) => LOCAL_OFFICIAL_TRAFFIC_SOURCES.has(source));
    const hasNationalFeed = sources.some((source) => NATIONAL_TRAFFIC_SOURCES.has(source));
    return hasLocalOfficial && hasNationalFeed;
}

function getDisplayPriority(item: CctvItem) {
    let score = 0;

    if (item.coordinateSource === 'official') {
        score += 100;
    } else if (item.coordinateSource === 'its_api') {
        score += 60;
    } else if (item.coordinateVerified) {
        score += 40;
    }

    if (item.source && LOCAL_OFFICIAL_TRAFFIC_SOURCES.has(item.source)) {
        score += 20;
    } else if (item.source && NATIONAL_TRAFFIC_SOURCES.has(item.source)) {
        score += 10;
    }

    if (item.streamUrl || item.hlsUrl) {
        score += 5;
    }

    return score;
}

function areLikelyDisplayDuplicates(a: CctvItem, b: CctvItem) {
    if (a.type !== b.type || a.region !== b.region) {
        return false;
    }

    const distance = haversineMeters(a, b);
    const aAddress = normalizeText(a.address);
    const bAddress = normalizeText(b.address);
    const sameAddress = Boolean(aAddress) && aAddress === bAddress;
    const aName = a.type === 'traffic' ? normalizeTrafficName(a.name) : normalizeText(a.name);
    const bName = a.type === 'traffic' ? normalizeTrafficName(b.name) : normalizeText(b.name);
    const sameName = Boolean(aName) && aName === bName;

    if (distance <= 8 && (sameAddress || sameName)) {
        return true;
    }

    if (a.type === 'traffic') {
        return distance <= 35 && isCrossFeedTrafficPair(a, b);
    }

    return distance <= 15 && (sameAddress || sameName);
}

function isSameFeedTrafficMicroDuplicate(a: CctvItem, b: CctvItem) {
    if (a.type !== 'traffic' || b.type !== 'traffic') {
        return false;
    }

    if (!a.source || !b.source || a.source !== b.source) {
        return false;
    }

    if (!NATIONAL_TRAFFIC_SOURCES.has(a.source)) {
        return false;
    }

    if (a.region !== b.region) {
        return false;
    }

    const aName = normalizeTrafficName(a.name);
    const bName = normalizeTrafficName(b.name);
    if (!aName || aName !== bName) {
        return false;
    }

    return haversineMeters(a, b) <= SUSPECT_SAME_FEED_TRAFFIC_DUPLICATE_METERS;
}

function matchesManualHiddenRule(item: CctvItem) {
    const source = item.source ?? '';
    const name = normalizeText(item.name);

    return MANUAL_HIDDEN_RULES.some((rule) =>
        rule.source === source && normalizeText(rule.name) === name
    );
}

function matchesSuspectItsRule(item: CctvItem, items: CctvItem[]) {
    if (item.type !== 'traffic') {
        return false;
    }

    if (!item.source || !NATIONAL_TRAFFIC_SOURCES.has(item.source)) {
        return false;
    }

    const nearbyOfficialTraffic = items.filter((candidate) =>
        candidate.id !== item.id
        && candidate.type === 'traffic'
        && candidate.region === item.region
        && candidate.source
        && LOCAL_OFFICIAL_TRAFFIC_SOURCES.has(candidate.source)
    );

    if (nearbyOfficialTraffic.length === 0) {
        return false;
    }

    const nearestDistance = nearbyOfficialTraffic.reduce((minDistance, candidate) => {
        const distance = haversineMeters(item, candidate);
        return Math.min(minDistance, distance);
    }, Number.POSITIVE_INFINITY);

    return nearestDistance <= SUSPECT_LOCAL_OFFICIAL_NEARBY_METERS;
}

export function dedupeOperationalDisplayCctv(items: CctvItem[]) {
    const kept: CctvItem[] = [];
    const hidden = new Set<string>();
    const hiddenFlagged = new Set<string>();

    const ranked = [...items].sort((left, right) =>
        getDisplayPriority(right) - getDisplayPriority(left)
        || left.name.localeCompare(right.name, 'ko')
    );

    ranked.forEach((item) => {
        if (matchesManualHiddenRule(item) || matchesSuspectItsRule(item, items)) {
            hiddenFlagged.add(item.id);
            return;
        }

        const primary = kept.find((candidate) => areLikelyDisplayDuplicates(item, candidate));
        if (primary) {
            hidden.add(item.id);
            return;
        }

        const sameFeedMicroDuplicate = kept.find((candidate) => isSameFeedTrafficMicroDuplicate(item, candidate));
        if (sameFeedMicroDuplicate) {
            hidden.add(item.id);
            return;
        }

        kept.push(item);
    });

    return {
        items: items.filter((item) => !hidden.has(item.id) && !hiddenFlagged.has(item.id)),
        hiddenFlaggedCount: hiddenFlagged.size,
        hiddenDuplicateCount: hidden.size,
        hiddenFlaggedIds: Array.from(hiddenFlagged),
        hiddenDuplicateIds: Array.from(hidden),
    };
}
