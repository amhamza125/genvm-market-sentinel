import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const payload = await req.json();

    // 1. Primary: NPoint (Extremely reliable, no CORS, raw JSON response)
    const npointRes = await fetch('https://api.npoint.io', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (npointRes.ok) {
        const npointData = await npointRes.json();
        if (npointData && npointData.id) {
            return NextResponse.json({ hostedUrl: `https://api.npoint.io/${npointData.id}` });
        }
    }

    // 2. Fallback: JSONBlob
    const blobRes = await fetch('https://jsonblob.com/api/jsonBlob', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'manual'
    });

    const locationUrl = blobRes.headers.get('Location') || blobRes.headers.get('location');
    if (locationUrl) {
        return NextResponse.json({ hostedUrl: locationUrl });
    }

    throw new Error(`Bin hosting failed. Npoint Status: ${npointRes.status}. Blob Status: ${blobRes.status}`);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Unknown proxy error" }, { status: 500 });
  }
}
