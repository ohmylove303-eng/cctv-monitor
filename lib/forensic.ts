const FORENSIC_API = process.env.NEXT_PUBLIC_FORENSIC_API || 'http://localhost:8001';

export async function analyzeCctv(cctvId: string, streamUrl: string, targetPlate?: string, targetColor?: string) {
    try {
        const res = await fetch(`${FORENSIC_API}/api/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cctv_id: cctvId, hls_url: streamUrl, target_plate: targetPlate, target_color: targetColor })
        });
        if (!res.ok) throw new Error('Forensic API request failed');
        return await res.json();
    } catch (e) {
        console.error('Forensic Analysis Error:', e);
        throw e;
    }
}

export async function trackVehicle(plate: string, color: string, cctvList: any[]) {
    try {
        const res = await fetch(`${FORENSIC_API}/api/track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plate, color, cctv_list: cctvList })
        });
        if (!res.ok) throw new Error('Forensic Tracking API request failed');
        return await res.json();
    } catch (e) {
        console.error('Forensic Tracking Error:', e);
        throw e;
    }
}

export async function getTrackingResult(trackingId: string) {
    const res = await fetch(`${FORENSIC_API}/api/track/${trackingId}`);
    return await res.json();
}
