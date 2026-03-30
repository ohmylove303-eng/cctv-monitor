import { proxyForensic } from '@/lib/forensic-server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    const body = await req.text();
    return proxyForensic('/api/track', {
        method: 'POST',
        body,
    });
}
