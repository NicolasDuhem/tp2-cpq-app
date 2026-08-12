-- QPart channel assignment mapping per part

create table if not exists qpart_part_channel_assignment (
  id bigserial primary key,
  part_id bigint not null references qpart_parts(id) on delete cascade,
  channel text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qpart_part_channel_assignment_channel_chk check (channel in ('Ecom', 'Dealer', 'Junction', 'Subscription')),
  constraint qpart_part_channel_assignment_part_channel_uniq unique (part_id, channel)
);

create index if not exists qpart_part_channel_assignment_channel_idx
  on qpart_part_channel_assignment (channel);
