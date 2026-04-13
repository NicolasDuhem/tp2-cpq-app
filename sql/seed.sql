insert into CPQ_setup_account_context (account_code, customer_id, currency, language, country_code, is_active)
values ('A000286', 'A000286', 'GBP', 'en-GB', 'GB', true)
on conflict (account_code) do update
set customer_id = excluded.customer_id,
    currency = excluded.currency,
    language = excluded.language,
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
