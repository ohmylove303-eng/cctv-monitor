import { forward as mgrsForward } from 'mgrs';

const MGRS_ACCURACY_1M = 5;

function formatMgrs(raw: string) {
    const normalized = raw.toUpperCase().replace(/\s+/g, '');
    const match = normalized.match(/^(\d{1,2}[C-HJ-NP-X])([A-HJ-NP-Z]{2})(\d{2,10})$/);

    if (!match) {
        return normalized;
    }

    const [, gridZone, squareId, digits] = match;
    const half = Math.floor(digits.length / 2);
    return `${gridZone} ${squareId} ${digits.slice(0, half)} ${digits.slice(half)}`;
}

export function toMilitaryGrid(lat: number, lng: number, accuracy = MGRS_ACCURACY_1M) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
    }

    try {
        return formatMgrs(mgrsForward([lng, lat], accuracy));
    } catch {
        return null;
    }
}
