import { proxyForensic } from '@/lib/forensic-server';

export const dynamic = 'force-dynamic';

interface Context {
    params: {
        trackingId: string;
    };
}

export async function GET(_: Request, context: Context) {
    const trackingId = encodeURIComponent(context.params.trackingId);
    return proxyForensic(`/api/track/${trackingId}`, {
        method: 'GET',
    });
}
