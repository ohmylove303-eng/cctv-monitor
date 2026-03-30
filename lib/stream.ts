function encodeProxyTarget(url: string): string {
    if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
        return encodeURIComponent(window.btoa(url));
    }

    if (typeof globalThis.btoa === 'function') {
        return encodeURIComponent(globalThis.btoa(url));
    }

    return encodeURIComponent(Buffer.from(url, 'utf8').toString('base64'));
}

export function toPlayableStreamUrl(url?: string | null): string {
    if (!url) return '';
    if (url.includes('/api/hls-proxy')) return url;

    if (url.includes('gitsview.gg.go.kr')) {
        return `/api/hls-proxy?mp4=${encodeProxyTarget(url)}`;
    }

    if (url.includes('gimpo.cctvstream.net')) {
        const channelMatch = url.match(/\/(c\d{3,4})\//i);
        if (channelMatch) {
            return `/api/hls-proxy?channel=${channelMatch[1]}`;
        }
        return `/api/hls-proxy?playlist=${encodeProxyTarget(url)}`;
    }

    if (
        url.includes('cctvsec.ktict.co.kr') ||
        url.includes('wmsAuthSign=') ||
        /\.m3u8(?:\?|$)/i.test(url)
    ) {
        return `/api/hls-proxy?playlist=${encodeProxyTarget(url)}`;
    }

    return url;
}
