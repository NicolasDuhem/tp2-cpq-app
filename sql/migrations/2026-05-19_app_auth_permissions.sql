create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text not null,
  password_hash text not null,
  is_active boolean not null default true,
  is_system_admin boolean not null default false,
  last_login_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists app_users_email_lower_key on app_users (lower(email));

create table if not exists app_permission_pages (
  id uuid primary key default gen_random_uuid(),
  page_key text not null unique,
  page_label text not null,
  route_path text not null,
  nav_group text null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_user_page_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  page_key text not null references app_permission_pages(page_key) on delete cascade,
  permission_level text not null check (permission_level in ('none','read','edit','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, page_key)
);

create table if not exists app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  session_token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz null
);

insert into app_permission_pages (page_key, page_label, route_path, nav_group, display_order)
values
('sales.bike_allocation','Sales Bike Allocation','/sales/bike-allocation','Sales',10),
('sales.qpart_allocation','Sales QPart Allocation','/sales/qpart-allocation','Sales',20),
('qpart.parts','QPart Parts','/qpart/parts','QPart',30),
('setup.users','Setup User','/setup/users','Setup',40),
('setup.rulesets','Setup Rulesets','/cpq/setup?tab=rulesets','Setup',50),
('setup.accounts','Setup Accounts','/cpq/setup?tab=accounts','Setup',60),
('setup.countries','Setup Countries','/cpq/setup?tab=accounts','Setup',70),
('setup.qpart_hierarchy','Setup QPart Hierarchy','/qpart/hierarchy','Setup',80),
('cpq.results','CPQ Results','/cpq/results','CPQ',90),
('admin.api_docs','Admin API Docs','/cpq/ui-docs','Admin',100)
on conflict (page_key) do nothing;
