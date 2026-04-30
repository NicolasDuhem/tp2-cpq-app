import { NextRequest, NextResponse } from 'next/server';
import { getPartDetail } from '@/lib/qpart/parts/service';
import { upsertQPartImageMetadata } from '@/lib/qpart/parts/image-service';

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid part id.' }, { status: 400 });

  const part = await getPartDetail(id);
  const partNumber = part?.part?.part_number?.trim();
  if (!part || !partNumber) return NextResponse.json({ error: 'Part not found or part number is missing.' }, { status: 400 });

  const formData = await req.formData();
  const upload = formData.get('image');
  if (!(upload instanceof File)) return NextResponse.json({ error: 'No image selected.' }, { status: 400 });
  if (!upload.type.startsWith('image/')) return NextResponse.json({ error: 'Selected file must be an image.' }, { status: 400 });

  const blobPath = `qparts/${partNumber}.jpg`;

  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return NextResponse.json({ error: 'BLOB_READ_WRITE_TOKEN is not configured.' }, { status: 500 });

    const uploadRes = await fetch(`https://blob.vercel-storage.com/${blobPath}?addRandomSuffix=false&allowOverwrite=true`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'image/jpeg',
        'x-content-type': 'image/jpeg',
      },
      body: upload,
    });

    const blob = (await uploadRes.json().catch(() => ({}))) as { url?: string; pathname?: string; error?: string };
    if (!uploadRes.ok || !blob.url || !blob.pathname) {
      return NextResponse.json({ error: blob.error || 'Blob upload failed.' }, { status: 500 });
    }

    const metadata = await upsertQPartImageMetadata({
      partId: id,
      partNumber,
      blobUrl: blob.url,
      blobPath: blob.pathname,
      mimeType: 'image/jpeg',
      fileSizeBytes: upload.size,
    });

    return NextResponse.json({ row: metadata, blobUrl: blob.url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to upload image.' }, { status: 500 });
  }
}
