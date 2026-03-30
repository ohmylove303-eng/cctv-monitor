import type { CctvItem, RoadPreset } from '@/types/cctv';

export const ROAD_PRESET_OPTIONS: Array<{
    id: RoadPreset;
    label: string;
    keywords: string[];
}> = [
    { id: 'all', label: '전체 도로', keywords: [] },
    {
        id: 'route48',
        label: '48번 국도축',
        keywords: [
            '48번 국도',
            '48번국도',
            '48호선',
            '국도 48',
            '국도48',
            '김포한강로',
            '서김포통진IC',
            '대곶IC',
            '검단양촌IC',
        ],
    },
    { id: 'ring1', label: '1순환축', keywords: ['수도권제1순환선', '수도권 1순환', '제1순환'] },
    { id: 'airport', label: '공항축', keywords: ['인천국제공항선', '인천국제공항고속도로', '공항대로', '공항신도시', '영종대교'] },
    { id: 'secondGyeongin', label: '제2경인축', keywords: ['제2경인선', '제2경인고속도로', '청라IC (제2경인)'] },
    { id: 'incheonBridge', label: '인천대교축', keywords: ['인천대교고속도로', '인천대교 진입로', '인천대교'] },
    { id: 'outer2', label: '제2외곽축', keywords: ['제2외곽순환선'] },
];

export function getRoadPresetLabel(preset: RoadPreset) {
    return ROAD_PRESET_OPTIONS.find((entry) => entry.id === preset)?.label ?? '도로축';
}

function searchableText(item: CctvItem) {
    return `${item.name} ${item.address} ${item.operator} ${item.source ?? ''}`;
}

export function matchesRoadPreset(item: CctvItem, preset: RoadPreset) {
    if (preset === 'all') {
        return item.type === 'traffic';
    }

    if (item.type !== 'traffic') {
        return false;
    }

    const option = ROAD_PRESET_OPTIONS.find((entry) => entry.id === preset);
    if (!option) {
        return false;
    }

    const haystack = searchableText(item);
    return option.keywords.some((keyword) => haystack.includes(keyword));
}
