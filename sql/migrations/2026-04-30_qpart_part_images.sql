create table if not exists qpart_part_images (
  id bigserial primary key,
  part_id bigint not null references qpart_parts(id) on delete cascade,
  part_number text not null,
  blob_url text not null,
  blob_path text not null,
  mime_type text not null default 'image/jpeg',
  file_size_bytes bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (part_id),
  unique (part_number)
);

