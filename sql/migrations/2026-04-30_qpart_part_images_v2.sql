alter table qpart_part_images
  add column if not exists image_index integer,
  add column if not exists is_primary boolean;

update qpart_part_images
set image_index = coalesce(image_index, 0),
    is_primary = coalesce(is_primary, true)
where image_index is null
   or is_primary is null;

alter table qpart_part_images
  alter column image_index set not null,
  alter column image_index set default 0,
  alter column is_primary set not null,
  alter column is_primary set default false;

alter table qpart_part_images drop constraint if exists qpart_part_images_part_id_key;
alter table qpart_part_images drop constraint if exists qpart_part_images_part_number_key;

create unique index if not exists qpart_part_images_part_slot_uq on qpart_part_images (part_id, image_index);
create unique index if not exists qpart_part_images_primary_uq on qpart_part_images (part_id) where is_primary;
create index if not exists qpart_part_images_part_order_idx on qpart_part_images (part_id, image_index);
