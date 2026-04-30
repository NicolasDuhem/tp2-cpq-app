import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { getPartDetail } from '@/lib/qpart/parts/service';
import { deleteQPartImageMetadata, getNextImageIndex, listQPartImages, upsertQPartImageMetadata } from '@/lib/qpart/parts/image-service';

type Params = { params: { id: string } };

const parseMode = (req: NextRequest) => req.nextUrl.searchParams.get('mode') || 'primary';

function buildBlobPath(partNumber: string, imageIndex: number) {
  return imageIndex === 0 ? `qparts/${partNumber}.jpg` : `qparts/${partNumber}_${imageIndex}.jpg`;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid part id.' }, { status: 400 });
  const rows = await listQPartImages(id);
  return NextResponse.json({ rows, primary: rows.find((row) => row.is_primary) ?? null });
}

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

  const mode = parseMode(req);
  const imageIndex = mode === 'additional' ? await getNextImageIndex(id) : 0;
  const blobPath = buildBlobPath(partNumber, imageIndex);

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
      imageIndex,
      isPrimary: imageIndex === 0,
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

export async function DELETE(req: NextRequest, { params }: Params) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid part id.' }, { status: 400 });

  const imageId = Number(req.nextUrl.searchParams.get('imageId'));
  if (!Number.isFinite(imageId)) return NextResponse.json({ error: 'Invalid image id.' }, { status: 400 });

  const rows = await listQPartImages(id);
  const target = rows.find((row) => row.id === imageId);
  if (!target) return NextResponse.json({ error: 'Image not found.' }, { status: 404 });

  try {
    await del(target.blob_url, { token: process.env.BLOB_READ_WRITE_TOKEN });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? `Blob delete failed: ${error.message}` : 'Blob delete failed.' }, { status: 502 });
  }

  const deleted = await deleteQPartImageMetadata(id, imageId);
  if (!deleted) {
    return NextResponse.json({ error: 'Metadata delete failed after blob delete; manual metadata cleanup may be required.' }, { status: 500 });
  }

  return NextResponse.json({ deleted });
}
