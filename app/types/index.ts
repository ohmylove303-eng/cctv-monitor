export type NormalizedCctv = {
    id: string;
    name: string;
    region: string;
    status: string;
    coordinates: [number, number, number];
    streamUrl: string | null;
    source: string;
};

export type SatellitePosition = {
    name: string;
    coordinates: [number, number, number];
};

export type CctvEvent = {
    id: string;
    cctvId: string;
    cctvName: string;
    type: 'status_change' | 'offline' | 'online' | 'alert';
    message: string;
    timestamp: string;
};

export type StatusSummary = {
    total: number;
    online: number;
    offline: number;
    unknown: number;
};

export type SatelliteMode = 'off' | 'gk2a' | 'sentinel' | 'planet';
