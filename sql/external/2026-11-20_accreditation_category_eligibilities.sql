-- EXTERNAL PostgreSQL (the database configured by EXTERNAL_PG_*), NOT Neon.
--
-- Target table for the Accreditation allocation push (/sales/accreditation-allocation).
-- Run once, in the schema configured by EXTERNAL_PG_SCHEMA (default `public`), before
-- the first push. Additive only: existing external tables (variants, variant_eligibilities)
-- are not touched.
--
-- One row per (channel, country, accreditation level, BigCommerce category).
-- "IsActive" is the EFFECTIVE state: the category AND all its parent categories are
-- active for that country/level in the tool. Every category of the channel is sent for
-- every active level, so an explicit false row means "not eligible".
--
-- The app writes a country as a full snapshot inside one transaction
-- (delete the country's rows for the channel, then insert the current rows), so readers
-- never see a half-written country and the unique index below is recommended but not
-- required by the writer.

create table if not exists public.accreditation_category_eligibilities (
  "ChannelId" bigint not null,
  "CountryCode" text not null,
  "AccreditationLevel" text not null,
  "CategoryId" bigint not null,
  "ParentCategoryId" bigint not null default 0,
  "CategoryName" text not null,
  "CategoryDepth" integer not null,
  "IsActive" boolean not null,
  "UpdatedAt" bigint not null
);

create unique index if not exists accreditation_category_eligibilities_key
  on public.accreditation_category_eligibilities ("ChannelId", "CountryCode", "AccreditationLevel", "CategoryId");

create index if not exists accreditation_category_eligibilities_country_idx
  on public.accreditation_category_eligibilities ("ChannelId", "CountryCode");

-- Example consumer query: which categories can a Gold dealer in GB see?
-- select "CategoryId", "CategoryName"
-- from public.accreditation_category_eligibilities
-- where "ChannelId" = <B2B channel id> and "CountryCode" = 'GB'
--   and "AccreditationLevel" = 'GOLD' and "IsActive" = true;
