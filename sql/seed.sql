insert into cpq_country_mappings (region, sub_region, country_code, is_active)
values
  ('America', 'North America', 'CA', true),
  ('America', 'North America', 'US', true),
  ('APAC', 'APAC', 'JP', true),
  ('APAC', 'APAC', 'SG', true),
  ('APAC', 'China', 'CN', true),
  ('Europe', 'DACH', 'AT', true),
  ('Europe', 'DACH', 'CH', true),
  ('Europe', 'DACH', 'DE', true),
  ('Europe', 'EMEA', 'BE', true),
  ('Europe', 'EMEA', 'CZ', true),
  ('Europe', 'EMEA', 'DK', true),
  ('Europe', 'EMEA', 'EL', true),
  ('Europe', 'EMEA', 'ES', true),
  ('Europe', 'EMEA', 'FI', true),
  ('Europe', 'EMEA', 'FR', true),
  ('Europe', 'EMEA', 'HU', true),
  ('Europe', 'EMEA', 'IT', true),
  ('Europe', 'EMEA', 'LT', true),
  ('Europe', 'EMEA', 'LU', true),
  ('Europe', 'EMEA', 'LV', true),
  ('Europe', 'EMEA', 'NL', true),
  ('Europe', 'EMEA', 'PL', true),
  ('Europe', 'EMEA', 'PT', true),
  ('Europe', 'EMEA', 'RO', true),
  ('Europe', 'EMEA', 'SE', true),
  ('Europe', 'EMEA', 'SI', true),
  ('Europe', 'UK', 'GB', true),
  ('Europe', 'UK', 'IE', true)
on conflict (region, sub_region, country_code) do update
set is_active = excluded.is_active,
    updated_at = now();

insert into CPQ_setup_account_context (account_code, customer_id, currency, language, region, sub_region, country_code, is_active)
values ('A000286', 'A000286', 'GBP', 'en-GB', 'Europe', 'UK', 'GB', true)
on conflict (account_code) do update
set customer_id = excluded.customer_id,
    currency = excluded.currency,
    language = excluded.language,
    region = excluded.region,
    sub_region = excluded.sub_region,
    country_code = excluded.country_code,
    is_active = excluded.is_active,
    updated_at = now();

insert into CPQ_setup_ruleset (cpq_ruleset, description, bike_type, namespace, header_id, sort_order, is_active)
values ('BBLV6_G-LineMY26', 'Default retained CPQ bike-builder ruleset', 'G Line', 'Default', 'Simulator', 0, true)
on conflict (cpq_ruleset) do update
set description = excluded.description,
    bike_type = excluded.bike_type,
    namespace = excluded.namespace,
    header_id = excluded.header_id,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();
