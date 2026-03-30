import type { CctvItem } from '@/types/cctv';

const VERIFIED_SOURCES = [
    'National-ITS',
    'GG_KTICT',
    'gimpo-its-main',
    'gimpo-its-cross',
    'incheon-utic',
] as const;

const APPROXIMATE_SOURCES = [
    'Gimpo-Local',
    'Incheon-Local',
    'Gimpo-Local-Traffic',
    'Incheon-Local-Traffic',
] as const;

type CoordinateQualityLike = Pick<CctvItem, 'source' | 'coordinateSource' | 'coordinateVerified'> | {
    source?: string | null;
    coordinateSource?: string | null;
    coordinateVerified?: boolean | null;
};

export function hasVerifiedCoordinate(item: CoordinateQualityLike) {
    if (typeof item.coordinateVerified === 'boolean') {
        return item.coordinateVerified;
    }

    if (item.coordinateSource === 'official' || item.coordinateSource === 'its_api') {
        return true;
    }

    return !!item.source && VERIFIED_SOURCES.includes(item.source as (typeof VERIFIED_SOURCES)[number]);
}

export function hasApproximateCoordinate(item: CoordinateQualityLike) {
    if (typeof item.coordinateVerified === 'boolean') {
        return !item.coordinateVerified;
    }

    if (item.coordinateSource === 'seed') {
        return true;
    }

    return !!item.source && APPROXIMATE_SOURCES.includes(item.source as (typeof APPROXIMATE_SOURCES)[number]);
}

export function getCoordinateQualityLabel(item: CoordinateQualityLike) {
    if (item.coordinateSource === 'official') {
        return '공식 좌표';
    }

    if (hasVerifiedCoordinate(item)) {
        return '검증 좌표';
    }

    if (hasApproximateCoordinate(item)) {
        return '근사 좌표';
    }

    return '미확인';
}
