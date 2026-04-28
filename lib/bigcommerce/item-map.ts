import { sql } from '@/lib/db/client';

export type BCStatus = 'OK' | 'NOK' | 'ERR' | 'DISABLED' | 'UNKNOWN';
export type BCItemType = 'BIKE' | 'QPART' | 'PNA' | 'UNKNOWN';

type ItemMapRow = {
  sku_code: string;
  item_type: BCItemType;
  bc_status: BCStatus;
  bc_product_id: number | null;
  bc_variant_id: number | null;
  bc_sku_id: number | null;
  bc_last_checked_at: string | null;
  bc_channel_status: BCStatus;
  bc_channels_json: unknown;
};

export type ItemMapLookupItem = {
  skuCode: string;
  itemType: BCItemType;
  bcStatus: BCStatus;
  bcProductId: number | null;
  bcVariantId: number | null;
  bcSkuId: number | null;
  bcLastCheckedAt: string | null;
  bcChannelStatus: BCStatus;
  bcChannelsJson: unknown;
};

export type ItemMapUpsertPayload = {
  itemType: BCItemType;
  sourcePage: string;
  items: Record<
    string,
    {
      status?: unknown;
      exists?: unknown;
      sku?: unknown;
      variantId?: unknown;
      productId?: unknown;
      skuId?: unknown;
      productName?: unknown;
      imageUrl?: unknown;
      calculatedPrice?: unknown;
      inventoryLevel?: unknown;
      purchasingDisabled?: unknown;
      isVisible?: unknown;
      variantJson?: unknown;
      error?: unknown;
      errorCode?: unknown;
    }
  >;
};

const asTrimmed = (value: unknown) => String(value ?? '').trim();

function toBcStatus(value: unknown): BCStatus {
  const status = asTrimmed(value).toUpperCase();
  if (status === 'OK' || status === 'NOK' || status === 'ERR' || status === 'DISABLED' || status === 'UNKNOWN') return status;
  return 'UNKNOWN';
}

function toItemType(value: unknown): BCItemType {
  const itemType = asTrimmed(value).toUpperCase();
  if (itemType === 'BIKE' || itemType === 'QPART' || itemType === 'PNA' || itemType === 'UNKNOWN') return itemType;
  return 'UNKNOWN';
}

function safeNullableText(value: unknown): string | null {
  const text = asTrimmed(value);
  return text ? text : null;
}

function safeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeInteger(value: unknown): number | null {
  const parsed = safeNumber(value);
  return parsed == null ? null : Math.trunc(parsed);
}

function safeBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 't' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 'f' || value === 0 || value === '0') return false;
  return null;
}

export async function lookupBigCommerceItemMap(skus: string[]): Promise<Record<string, ItemMapLookupItem>> {
  const normalizedSkus = [...new Set(skus.map(asTrimmed).filter(Boolean))];
  if (!normalizedSkus.length) return {};

  const rows = (await sql`
    with target_skus as (
      select value::text as sku_code
      from jsonb_array_elements_text(${JSON.stringify(normalizedSkus)}::jsonb)
    )
    select
      map.sku_code,
      map.item_type,
      map.bc_status,
      map.bc_product_id,
      map.bc_variant_id,
      map.bc_sku_id,
      map.bc_last_checked_at,
      map.bc_channel_status,
      map.bc_channels_json
    from public.bc_item_variant_map map
    where map.sku_code in (select sku_code from target_skus)
  `) as ItemMapRow[];

  return Object.fromEntries(
    rows.map((row) => [
      row.sku_code,
      {
        skuCode: row.sku_code,
        itemType: row.item_type,
        bcStatus: row.bc_status,
        bcProductId: row.bc_product_id,
        bcVariantId: row.bc_variant_id,
        bcSkuId: row.bc_sku_id,
        bcLastCheckedAt: row.bc_last_checked_at,
        bcChannelStatus: row.bc_channel_status,
        bcChannelsJson: row.bc_channels_json,
      },
    ]),
  );
}

export async function upsertBigCommerceItemMap(payload: ItemMapUpsertPayload): Promise<number> {
  const itemType = toItemType(payload.itemType);
  const sourcePage = safeNullableText(payload.sourcePage);
  const entries = Object.entries(payload.items ?? {});

  let upserted = 0;
  for (const [requestedSku, rawItem] of entries) {
    const skuCode = asTrimmed(rawItem?.sku ?? requestedSku);
    if (!skuCode) continue;

    const status = toBcStatus(rawItem?.status);
    const variantJson = rawItem?.variantJson == null ? null : rawItem.variantJson;
    const bcProductId = safeInteger(rawItem?.productId);
    const bcVariantId = safeInteger(rawItem?.variantId);
    const bcSkuId = safeInteger(rawItem?.skuId);

    const rows = (await sql`
      insert into public.bc_item_variant_map (
        sku_code,
        item_type,
        bc_product_id,
        bc_variant_id,
        bc_sku_id,
        bc_status,
        bc_product_name,
        bc_variant_sku,
        bc_image_url,
        bc_calculated_price,
        bc_inventory_level,
        bc_purchasing_disabled,
        bc_is_visible,
        bc_variant_json,
        bc_last_checked_at,
        bc_last_error,
        bc_error_code,
        source_page,
        updated_at
      ) values (
        ${skuCode},
        ${itemType},
        ${status === 'OK' ? bcProductId : null},
        ${status === 'OK' ? bcVariantId : null},
        ${status === 'OK' ? bcSkuId : null},
        ${status},
        ${status === 'OK' ? safeNullableText(rawItem?.productName) : null},
        ${status === 'OK' ? safeNullableText(rawItem?.sku) : null},
        ${status === 'OK' ? safeNullableText(rawItem?.imageUrl) : null},
        ${status === 'OK' ? safeNumber(rawItem?.calculatedPrice) : null},
        ${status === 'OK' ? safeInteger(rawItem?.inventoryLevel) : null},
        ${status === 'OK' ? safeBoolean(rawItem?.purchasingDisabled) : null},
        ${status === 'OK' ? safeBoolean(rawItem?.isVisible) : null},
        ${status === 'OK' ? JSON.stringify(variantJson) : null}::jsonb,
        now(),
        ${status === 'ERR' ? safeNullableText(rawItem?.error) : null},
        ${status === 'ERR' ? safeNullableText(rawItem?.errorCode) : null},
        ${sourcePage},
        now()
      )
      on conflict (sku_code) do update
      set
        item_type = excluded.item_type,
        bc_product_id = case
          when excluded.bc_status = 'OK' then excluded.bc_product_id
          when excluded.bc_status = 'NOK' then null
          when excluded.bc_status = 'ERR' then coalesce(public.bc_item_variant_map.bc_product_id, excluded.bc_product_id)
          else public.bc_item_variant_map.bc_product_id
        end,
        bc_variant_id = case
          when excluded.bc_status = 'OK' then excluded.bc_variant_id
          when excluded.bc_status = 'NOK' then null
          when excluded.bc_status = 'ERR' then coalesce(public.bc_item_variant_map.bc_variant_id, excluded.bc_variant_id)
          else public.bc_item_variant_map.bc_variant_id
        end,
        bc_sku_id = case
          when excluded.bc_status = 'OK' then excluded.bc_sku_id
          when excluded.bc_status = 'NOK' then null
          when excluded.bc_status = 'ERR' then coalesce(public.bc_item_variant_map.bc_sku_id, excluded.bc_sku_id)
          else public.bc_item_variant_map.bc_sku_id
        end,
        bc_status = excluded.bc_status,
        bc_product_name = case when excluded.bc_status = 'OK' then excluded.bc_product_name else public.bc_item_variant_map.bc_product_name end,
        bc_variant_sku = case when excluded.bc_status = 'OK' then excluded.bc_variant_sku else public.bc_item_variant_map.bc_variant_sku end,
        bc_image_url = case when excluded.bc_status = 'OK' then excluded.bc_image_url else public.bc_item_variant_map.bc_image_url end,
        bc_calculated_price = case when excluded.bc_status = 'OK' then excluded.bc_calculated_price else public.bc_item_variant_map.bc_calculated_price end,
        bc_inventory_level = case when excluded.bc_status = 'OK' then excluded.bc_inventory_level else public.bc_item_variant_map.bc_inventory_level end,
        bc_purchasing_disabled = case when excluded.bc_status = 'OK' then excluded.bc_purchasing_disabled else public.bc_item_variant_map.bc_purchasing_disabled end,
        bc_is_visible = case when excluded.bc_status = 'OK' then excluded.bc_is_visible else public.bc_item_variant_map.bc_is_visible end,
        bc_variant_json = case when excluded.bc_status = 'OK' then excluded.bc_variant_json else public.bc_item_variant_map.bc_variant_json end,
        bc_last_checked_at = now(),
        bc_last_error = case when excluded.bc_status = 'ERR' then excluded.bc_last_error else null end,
        bc_error_code = case when excluded.bc_status = 'ERR' then excluded.bc_error_code else null end,
        source_page = excluded.source_page,
        updated_at = now()
      where not (excluded.bc_status = 'DISABLED' and public.bc_item_variant_map.bc_last_checked_at is not null)
      returning id
    `) as Array<{ id: number }>;

    if (rows.length > 0) upserted += 1;
  }

  return upserted;
}
