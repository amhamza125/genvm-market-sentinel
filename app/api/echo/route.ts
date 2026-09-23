import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dataParam = url.searchParams.get('d');

    if (!dataParam) {
      return new NextResponse('Missing data payload in URL', { status: 400 });
    }

    // Decode the Base64 payload back into the exact JSON string
    const decodedStr = Buffer.from(dataParam, 'base64').toString('utf-8');

    return new NextResponse(decodedStr, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (err: any) {
    return new NextResponse(`Echo Error: ${err.message}`, { status: 500 });
  }
}
