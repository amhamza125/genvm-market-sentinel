import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dataParam = url.searchParams.get('d');

    if (!dataParam) {
      return new NextResponse('Missing data payload', { status: 400 });
    }

    let decodedStr = '';
    if (typeof atob === 'function') {
        decodedStr = atob(dataParam);
    } else {
        decodedStr = Buffer.from(dataParam, 'base64').toString('utf-8');
    }

    // CRITICAL FIX: Return as text/plain so GenVM hands it to the contract as a pure Python string.
    return new NextResponse(decodedStr, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (err: any) {
    return new NextResponse(`Echo Error: ${err.message}`, { status: 500 });
  }
}
