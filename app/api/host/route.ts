import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    
    // Server-side upload to raw bin (Bypasses browser CORS & Vercel WAF)
    const res = await fetch('https://jsonblob.com/api/jsonBlob', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const locationUrl = res.headers.get('Location');
    if (!locationUrl) throw new Error("External bin host failed to return URL.");

    return NextResponse.json({ hostedUrl: locationUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
