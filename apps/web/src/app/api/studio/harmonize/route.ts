import { NextResponse } from 'next/server';
import { harmonizationRequestSchema } from '@/lib/studio/harmonization-contract';
import { harmonizePhotometrically } from '@/lib/studio/photometric-harmonize';

export const runtime = 'nodejs';
export const maxDuration = 60;
const MAX_BYTES = 24_000_000;

export async function POST(request: Request) {
  try {
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ success: false, error: 'Request body is required.' }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_BYTES) { await reader.cancel(); return NextResponse.json({ success: false, error: 'Scene exceeds the 24 MB request limit.' }, { status: 413 }); }
      chunks.push(chunk.value);
    }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 }); }
    const parsed = harmonizationRequestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Invalid harmonization payload.', fields: parsed.error.flatten() }, { status: 400 });
    const result = await harmonizePhotometrically(parsed.data, request.signal);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) {
    if (request.signal.aborted) return NextResponse.json({ success: false, error: 'Harmonization cancelled.' }, { status: 499 });
    console.error('Photometric harmonization failed:', cause);
    return NextResponse.json({ success: false, error: 'Unable to process this scene. Check image dimensions and try again.' }, { status: 422 });
  }
}
