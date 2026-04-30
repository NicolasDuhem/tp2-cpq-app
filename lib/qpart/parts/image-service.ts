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

export async function listQPartImages(partId: number) {
  return sql<QPartImageRow[]>`
    select ${imageSelection}
    from qpart_part_images
    where part_id = ${partId}
    order by image_index asc
  `;
}

export async function getNextImageIndex(partId: number) {
  const rows = await sql<{ image_index: number }[]>`
    select image_index
    from qpart_part_images
    where part_id = ${partId}
      and image_index > 0
    order by image_index asc
  `;

  let next = 1;
  for (const row of rows) {
    if (row.image_index === next) next += 1;
    if (row.image_index > next) break;
  }
  return next;
}

export async function upsertQPartImageMetadata(input: QPartImageMetadataInput) {
  const rows = await sql<QPartImageRow[]>`
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
  return rows[0] ?? null;
}

export async function deleteQPartImageMetadata(partId: number, imageId: number) {
  const rows = await sql<QPartImageRow[]>`
    delete from qpart_part_images
    where part_id = ${partId}
      and id = ${imageId}
    returning ${imageSelection}
  `;
  return rows[0] ?? null;
}
