import { Agent, request } from 'node:https';

import type { CctvItem } from '@/types/cctv';

const UTIC_BASE = 'https://www.utic.go.kr';
const MAP_REFERER = `${UTIC_BASE}/map/map.do?menu=cctv`;
const INCHON_CENTER_NAME = '인천교통정보센터';
const HTTPS_AGENT = new Agent({
    keepAlive: true,
    // UTIC serves a chain curl/browser accept but Node rejects in this environment.
    rejectUnauthorized: false,
});

const DISTRICT_PATTERN = /(강화군|계양구|남동구|동구|미추홀구|부평구|서구|연수구|중구|옹진군|강화|계양|남동|동구|미추홀|부평|서구|연수|중구|옹진)/;

type HeaderValue = string | string[] | undefined;
type HttpsResponse = {
    statusCode: number;
    headers: Record<string, HeaderValue>;
    body: string;
};

type UticCameraRecord = {
    CCTVID?: string;
    XCOORD?: number;
    YCOORD?: number;
    MOVIE?: string;
    KIND?: string;
    CENTERNAME?: string;
    CCTVNAME?: string;
    ID?: string;
    STRMID?: string;
};

function headerValueToString(value: HeaderValue) {
    if (Array.isArray(value)) {
        return value.join('; ');
    }

    return value ?? '';
}

function buildCookieHeader(headers: Record<string, HeaderValue>) {
    const setCookie = headers['set-cookie'];
    const values = Array.isArray(setCookie) ? setCookie : (setCookie ? [setCookie] : []);

    return values
        .map((entry) => entry.split(';')[0]?.trim())
        .filter(Boolean)
        .join('; ');
}

function inferDistrict(name: string) {
    const matched = name.match(DISTRICT_PATTERN)?.[1];
    if (!matched) {
        return '인천';
    }

    return matched.endsWith('구') || matched.endsWith('군') ? matched : `${matched}${matched.endsWith('동') ? '' : '구'}`;
}

function buildIncheonHlsUrl(streamId: string) {
    return `https://cctv.fitic.go.kr/cctv/${encodeURIComponent(streamId)}.stream/playlist.m3u8`;
}

function httpsRequest(url: string, headers: Record<string, string> = {}) {
    return new Promise<HttpsResponse>((resolve, reject) => {
        const req = request(url, {
            method: 'GET',
            headers,
            agent: HTTPS_AGENT,
        }, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk) => {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            });
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode ?? 0,
                    headers: res.headers as Record<string, HeaderValue>,
                    body: Buffer.concat(chunks).toString('utf8'),
                });
            });
        });

        req.on('error', reject);
        req.end();
    });
}

function normalizeIncheonCamera(record: UticCameraRecord): CctvItem | null {
    const rawCctvId = String(record.CCTVID ?? '').trim();
    const streamId = String(record.ID ?? '').trim();
    const name = String(record.CCTVNAME ?? '').trim();
    const lat = Number(record.YCOORD ?? Number.NaN);
    const lng = Number(record.XCOORD ?? Number.NaN);

    if (!rawCctvId || !streamId || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
    }

    if (lat < 37 || lat > 38 || lng < 126 || lng > 127) {
        return null;
    }

    const district = inferDistrict(name);
    const hlsUrl = buildIncheonHlsUrl(streamId);

    return {
        id: `IUTIC-${rawCctvId}`,
        name,
        type: 'traffic',
        status: '정상',
        region: '인천',
        district,
        address: district === '인천' ? `인천 ${name}` : `인천 ${district} ${name}`,
        operator: INCHON_CENTER_NAME,
        streamUrl: hlsUrl,
        hlsUrl,
        resolution: 'HLS Live',
        lat,
        lng,
        source: 'incheon-utic',
        coordinateSource: 'official',
        coordinateVerified: true,
        coordinateNote: 'UTIC 인천교통정보센터 공식 CCTV 좌표',
    };
}

export async function fetchIncheonUticCctv() {
    const mapPage = await httpsRequest(MAP_REFERER, {
        'User-Agent': 'Mozilla/5.0 (compatible; CCTV-Monitor/2.2)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    });

    if (mapPage.statusCode < 200 || mapPage.statusCode >= 300) {
        throw new Error(`UTIC map bootstrap failed: ${mapPage.statusCode}`);
    }

    const cookie = buildCookieHeader(mapPage.headers);
    if (!cookie) {
        throw new Error('UTIC map bootstrap did not return session cookie');
    }

    const cctvResponse = await httpsRequest(`${UTIC_BASE}/map/mapcctv.do`, {
        'User-Agent': 'Mozilla/5.0 (compatible; CCTV-Monitor/2.2)',
        Referer: MAP_REFERER,
        Accept: 'application/json, text/javascript, */*; q=0.01',
        Cookie: cookie,
    });

    if (cctvResponse.statusCode < 200 || cctvResponse.statusCode >= 300) {
        throw new Error(`UTIC CCTV API failed: ${cctvResponse.statusCode}`);
    }

    const text = cctvResponse.body.trim();
    if (!text.startsWith('[')) {
        throw new Error(`UTIC CCTV API rejected request: ${text.slice(0, 120)}`);
    }

    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
        throw new Error('UTIC CCTV API returned non-array payload');
    }

    return parsed
        .filter((item) => String(item?.CENTERNAME ?? '').trim() === INCHON_CENTER_NAME)
        .map(normalizeIncheonCamera)
        .filter((item): item is CctvItem => Boolean(item));
}
