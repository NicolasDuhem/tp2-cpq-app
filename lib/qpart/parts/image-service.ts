import { list } from '@vercel/blob';
import { sql } from '@/lib/db/client';

export type QPartImageMetadataInput = {
  partId: number;
  partNumber: string;
  blobUrl: string;
  blobPath: string;
  mimeType: string;
  fileSizeBytes: number;
  imageIndex: number;
  isPrimary: boolean;
};

export type QPartImageRow = {
  id: number;
  part_id: number;
  part_number: string;
  image_index: number;
  is_primary: boolean;
  blob_url: string;
  blob_path: string;
  mime_type: string;
  file_size_bytes: number;
  created_at: string;
  updated_at: string;
};

const imageSelection = sql`id, part_id, part_number, image_index, is_primary, blob_url, blob_path, mime_type, file_size_bytes, created_at, updated_at`;
function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


function normalizeQPartImageRows(result: unknown): QPartImageRow[] {
  if (!Array.isArray(result)) return [];

  return result.filter((row): row is QPartImageRow => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
    const candidate = row as Partial<QPartImageRow>;
    return (
      typeof candidate.id === 'number' &&
      typeof candidate.part_id === 'number' &&
      typeof candidate.part_number === 'string' &&
      typeof candidate.image_index === 'number' &&
      typeof candidate.is_primary === 'boolean' &&
      typeof candidate.blob_url === 'string' &&
      typeof candidate.blob_path === 'string' &&
      typeof candidate.mime_type === 'string' &&
      typeof candidate.file_size_bytes === 'number' &&
      typeof candidate.created_at === 'string' &&
      typeof candidate.updated_at === 'string'
    );
  });
}

export async function listQPartImages(partId: number): Promise<QPartImageRow[]> {
  const result = await sql`
    select ${imageSelection}
    from qpart_part_images
    where part_id = ${partId}
    order by image_index asc, id asc
  `;

  return normalizeQPartImageRows(result);
}

export async function reconcileQPartImages(partId: number, partNumber: string): Promise<QPartImageRow[]> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token || !partNumber.trim()) return listQPartImages(partId);

  const canonicalPartNumber = partNumber.trim();
  const prefix = `qparts/${canonicalPartNumber}`;
  const escapedPartNumber = escapeRegExp(canonicalPartNumber);
  const blobRows = await list({ token, prefix, limit: 1000 });
  const candidates = blobRows.blobs.filter((blob) => blob.pathname.startsWith(prefix));

  for (const blob of candidates) {
    const path = blob.pathname;
    const suffixMatch = path.match(new RegExp(`^qparts/${escapedPartNumber}_(\\d+)\\.jpg$`, 'i'));
    const mainMatch = path.match(new RegExp(`^qparts/${escapedPartNumber}\\.jpg$`, 'i'));
    const imageIndex = mainMatch ? 0 : suffixMatch ? Number(suffixMatch[1]) : null;
    const isPrimary = imageIndex === 0;

    if (imageIndex === null) {
      const existing = await sql`
        select id
        from qpart_part_images
        where part_id = ${partId}
          and blob_path = ${path}
        limit 1
      ` as Array<{ id: number }>;

      if (!existing.length) {
        const nextLegacyIndexRow = await sql`
          select coalesce(max(image_index), 0) + 1 as next_index
          from qpart_part_images
          where part_id = ${partId}
        ` as Array<{ next_index: number }>;

        await upsertQPartImageMetadata({
          partId,
          partNumber,
          imageIndex: nextLegacyIndexRow[0]?.next_index ?? 1,
          isPrimary: false,
          blobUrl: blob.url,
          blobPath: path,
          mimeType: blob.contentType || 'image/jpeg',
          fileSizeBytes: blob.size || 0,
        });
      }
      continue;
    }

    await upsertQPartImageMetadata({
      partId,
      partNumber,
      imageIndex,
      isPrimary,
      blobUrl: blob.url,
      blobPath: path,
      mimeType: blob.contentType || 'image/jpeg',
      fileSizeBytes: blob.size || 0,
    });
  }

  return listQPartImages(partId);
}

export async function getNextImageIndex(partId: number) {
  const result = await sql`
    select image_index
    from qpart_part_images
    where part_id = ${partId}
      and image_index > 0
    order by image_index asc, id asc
  `;

  const rows = result as Array<{ image_index: number }>;

  let next = 1;
  for (const row of rows) {
    if (row.image_index === next) next += 1;
    if (row.image_index > next) break;
  }
  return next;
}

export async function upsertQPartImageMetadata(input: QPartImageMetadataInput) {
  const result = await sql`
    insert into qpart_part_images (part_id, part_number, image_index, is_primary, blob_url, blob_path, mime_type, file_size_bytes)
    values (
      ${input.partId},
      ${input.partNumber},
      ${input.imageIndex},
      ${input.isPrimary},
      ${input.blobUrl},
      ${input.blobPath},
      ${input.mimeType},
      ${input.fileSizeBytes}
    )
    on conflict (part_id, image_index)
    do update set
      part_number = excluded.part_number,
      is_primary = excluded.is_primary,
      blob_url = excluded.blob_url,
      blob_path = excluded.blob_path,
      mime_type = excluded.mime_type,
      file_size_bytes = excluded.file_size_bytes,
      updated_at = now()
    returning ${imageSelection}
  `;

  const rows = normalizeQPartImageRows(result);
  const upserted = rows[0] ?? null;

  if (upserted && input.imageIndex === 0) {
    await sql`
      update qpart_part_images
      set is_primary = case when id = ${upserted.id} then true else false end,
          updated_at = now()
      where part_id = ${input.partId}
    `;

    const refreshed = await sql`
      select ${imageSelection}
      from qpart_part_images
      where id = ${upserted.id}
      limit 1
    `;
    return normalizeQPartImageRows(refreshed)[0] ?? upserted;
  }

  return upserted;
}

export async function deleteQPartImageMetadata(partId: number, imageId: number) {
  const result = await sql`
    delete from qpart_part_images
    where part_id = ${partId}
      and id = ${imageId}
    returning ${imageSelection}
  `;

  const rows = normalizeQPartImageRows(result);
  return rows[0] ?? null;
}

export function choosePreferredQPartImage(rows: QPartImageRow[]): QPartImageRow | null {
  const primaryCandidates = rows
    .filter((row) => row.is_primary)
    .sort((a, b) => a.image_index - b.image_index || a.id - b.id);

  if (primaryCandidates.length) return primaryCandidates[0];

  const byIndex = [...rows].sort((a, b) => a.image_index - b.image_index || a.id - b.id);
  return byIndex[0] ?? null;
}
