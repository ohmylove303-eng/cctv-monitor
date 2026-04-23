export function buildNationalItsDedupKey(item: Record<string, unknown>) {
    const explicitId = String(item.id ?? item.cctvId ?? item.cctvid ?? '').trim();
    if (explicitId) {
        return `id:${explicitId}`;
    }

    const roadSectionId = String(item.roadsectionid ?? '').trim();
    if (roadSectionId) {
        return `road:${roadSectionId}`;
    }

    const name = String(item.cctvname ?? item.cctvNm ?? item.name ?? '').trim();
    const coordX = String(item.coordx ?? item.longitude ?? '').trim();
    const coordY = String(item.coordy ?? item.latitude ?? '').trim();
    if (name && coordX && coordY) {
        return `name-coord:${name}::${coordX}::${coordY}`;
    }

    const streamUrl = String(item.cctvurl ?? item.cctvUrl ?? item.hlsUrl ?? item.streamUrl ?? '').trim();
    if (name && streamUrl) {
        return `name-stream:${name}::${streamUrl}`;
    }

    if (name) {
        return `name:${name}`;
    }

    return `coord:${coordX}-${coordY}`;
}
