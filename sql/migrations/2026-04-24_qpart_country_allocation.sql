-- QPart territory allocation matrix backing table

begin;

create table if not exists qpart_country_allocation (
  id bigserial primary key,
  part_id bigint not null references qpart_parts(id) on delete cascade,
  country_code char(2) not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qpart_country_allocation_country_code_chk check (country_code ~ '^[A-Z]{2}$'),
  constraint qpart_country_allocation_part_country_uniq unique (part_id, country_code)
);

create index if not exists qpart_country_allocation_country_idx
  on qpart_country_allocation (country_code);

create index if not exists qpart_country_allocation_active_idx
  on qpart_country_allocation (active);

commit;
