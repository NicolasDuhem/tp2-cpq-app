import { sql } from '@/lib/db/client';

export type QPartImageMetadataInput = {
  partId: number;
  partNumber: string;
  blobUrl: string;
  blobPath: string;
  mimeType: string;
  fileSizeBytes: number;
};

export async function upsertQPartImageMetadata(input: QPartImageMetadataInput) {
  const rows = await sql`
    insert into qpart_part_images (part_id, part_number, blob_url, blob_path, mime_type, file_size_bytes)
    values (${input.partId}, ${input.partNumber}, ${input.blobUrl}, ${input.blobPath}, ${input.mimeType}, ${input.fileSizeBytes})
    on conflict (part_id)
    do update set
      part_number = excluded.part_number,
      blob_url = excluded.blob_url,
      blob_path = excluded.blob_path,
      mime_type = excluded.mime_type,
      file_size_bytes = excluded.file_size_bytes,
      updated_at = now()
    returning id, part_id, part_number, blob_url, blob_path, mime_type, file_size_bytes, created_at, updated_at
  `;
  return rows[0] ?? null;
}
