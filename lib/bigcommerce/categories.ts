import 'server-only';

import { getBigCommerceConfig } from '@/lib/bigcommerce/client';
import { flattenBcCategoryTree, type AccreditationCategory } from '@/lib/sales/accreditation-allocation/tree';

/**
 * BigCommerce category-tree reader for the Accreditation allocation page.
 *
 * Reuses the existing store credentials (BIGCOMMERCE_API_BASE_URL / STORE_HASH /
 * ACCESS_TOKEN) but deliberately does NOT depend on BIGCOMMERCE_BC_STATUS_ENABLED,
 * which only governs the variant status checks on the allocation pages.
 *
 * Channel resolution (only the Brompton B2B channel matters):
 *   1. BIGCOMMERCE_ACCREDITATION_CHANNEL_ID set -> the tree assigned to that channel.
 *   2. otherwise the tree whose name equals BIGCOMMERCE_ACCREDITATION_TREE_NAME
 *      (default "Brompton B2B"), then a channel with that name.
 */

export const DEFAULT_ACCREDITATION_TREE_NAME = 'Brompton B2B';

export type AccreditationChannelTree = {
  channelId: number;
  treeId: number;
  treeName: string | null;
};

type BcTree = { id?: number; name?: string; channels?: number[] };
type BcChannel = { id?: number; name?: string };

export function getConfiguredAccreditationChannelId(): number | null {
  const raw = String(process.env.BIGCOMMERCE_ACCREDITATION_CHANNEL_ID ?? '').trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function getConfiguredTreeName(): string {
  return String(process.env.BIGCOMMERCE_ACCREDITATION_TREE_NAME ?? '').trim() || DEFAULT_ACCREDITATION_TREE_NAME;
}

async function bcGet<T>(path: string): Promise<T> {
  const config = getBigCommerceConfig();
  const missing: string[] = [];
  if (!config.storeHash) missing.push('BIGCOMMERCE_STORE_HASH');
  if (!config.accessToken) missing.push('BIGCOMMERCE_ACCESS_TOKEN');
  if (missing.length) throw new Error(`BigCommerce config missing: ${missing.join(', ')}`);

  const controller = new AbortController();
  // Category trees can be larger than a variant batch: allow at least 20s.
  const timeoutMs = Math.max(config.timeoutMs, 20_000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${config.apiBaseUrl}/stores/${config.storeHash}${path}`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'X-Auth-Token': config.accessToken, Accept: 'application/json', 'Content-Type': 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`BigCommerce request failed (${response.status}) on ${path}: ${body.slice(0, 500) || 'No response body'}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`BigCommerce request timed out after ${timeoutMs}ms on ${path}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function listTrees(query = ''): Promise<BcTree[]> {
  const out: BcTree[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const params = new URLSearchParams(query);
    params.set('page', String(page));
    params.set('limit', '250');
    const payload = await bcGet<{ data?: BcTree[]; meta?: { pagination?: { total_pages?: number } } }>(
      `/v3/catalog/trees?${params.toString()}`,
    );
    out.push(...(payload.data ?? []));
    const totalPages = Number(payload.meta?.pagination?.total_pages ?? 1);
    if (!Number.isFinite(totalPages) || page >= totalPages) break;
  }
  return out;
}

async function listChannels(): Promise<BcChannel[]> {
  const payload = await bcGet<{ data?: BcChannel[] }>(`/v3/channels?limit=250`);
  return payload.data ?? [];
}

const sameName = (a: unknown, b: string) => String(a ?? '').trim().toLowerCase() === b.trim().toLowerCase();

export async function resolveAccreditationChannelTree(): Promise<AccreditationChannelTree> {
  const configuredChannelId = getConfiguredAccreditationChannelId();
  if (configuredChannelId) {
    const trees = await listTrees(`channel_id:in=${configuredChannelId}`);
    const tree = trees.find((entry) => Number(entry.id) > 0);
    if (!tree) throw new Error(`No BigCommerce category tree is assigned to channel ${configuredChannelId}.`);
    return { channelId: configuredChannelId, treeId: Number(tree.id), treeName: tree.name ?? null };
  }

  const name = getConfiguredTreeName();
  const trees = await listTrees();
  const namedTree = trees.find((entry) => sameName(entry.name, name));
  if (namedTree && Number(namedTree.id) > 0 && Array.isArray(namedTree.channels) && namedTree.channels.length > 0) {
    return { channelId: Number(namedTree.channels[0]), treeId: Number(namedTree.id), treeName: namedTree.name ?? null };
  }

  const channel = (await listChannels()).find((entry) => sameName(entry.name, name));
  if (channel && Number(channel.id) > 0) {
    const tree = trees.find((entry) => Array.isArray(entry.channels) && entry.channels.includes(Number(channel.id)));
    if (tree && Number(tree.id) > 0) return { channelId: Number(channel.id), treeId: Number(tree.id), treeName: tree.name ?? null };
  }

  throw new Error(
    `Could not find a BigCommerce category tree or channel named "${name}". Set BIGCOMMERCE_ACCREDITATION_CHANNEL_ID to the Brompton B2B channel id.`,
  );
}

/** Full category tree for one tree id, flattened (parents before children, BC order). */
export async function fetchAccreditationCategoryTree(treeId: number): Promise<AccreditationCategory[]> {
  const payload = await bcGet<{ data?: unknown }>(`/v3/catalog/trees/${treeId}/categories`);
  return flattenBcCategoryTree(payload.data ?? []);
}
