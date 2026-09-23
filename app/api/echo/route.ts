import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dataParam = url.searchParams.get('d');

    if (!dataParam) {
      return new NextResponse(JSON.stringify({ error: 'Missing data payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Universal Base64 decoding (Crash-proof for both Edge and Node runtimes)
    let decodedStr = '';
    if (typeof atob === 'function') {
        decodedStr = atob(dataParam);
    } else {
        decodedStr = Buffer.from(dataParam, 'base64').toString('utf-8');
    }

    // Return the pure, decoded JSON string so GenVM can read it natively
    return new NextResponse(decodedStr, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (err: any) {
    return new NextResponse(JSON.stringify({ error: `Echo Error: ${err.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
