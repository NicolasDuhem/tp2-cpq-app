const CAPTIONS = new Set(['forecastas','description','detailid','tradeprice','msrp']);

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const asText = (v: unknown) => String(v ?? '').trim();

function isMeaningful(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const t = value.trim();
    return t !== '' && t !== '0';
  }
  return true;
}

function getCaseInsensitive(obj: Record<string, unknown>, keys: string[]): unknown {
  const map = new Map(Object.keys(obj).map((k) => [k.toLowerCase(), k] as const));
  for (const key of keys) {
    const hit = map.get(key.toLowerCase());
    if (hit) return obj[hit];
  }
  return undefined;
}

function reduceNode(input: unknown, path: string[]): JsonValue | undefined {
  if (Array.isArray(input)) {
    const reduced = input
      .map((item, index) => reduceNode(item, [...path, `[${index}]`]))
      .filter((item): item is JsonValue => item !== undefined);
    return reduced.length ? reduced : undefined;
  }

  if (!isObject(input)) return undefined;

  const captionRaw = getCaseInsensitive(input, ['caption', 'name', 'field']);
  const caption = asText(captionRaw);
  const normalizedCaption = caption.toLowerCase();
  const value = getCaseInsensitive(input, ['value', 'text', 'valuetext']);

  if (CAPTIONS.has(normalizedCaption) && isMeaningful(value)) {
    return {
      caption,
      value: value as JsonValue,
      key: asText(getCaseInsensitive(input, ['key', 'id', 'field', 'name'])) || undefined,
      label: asText(getCaseInsensitive(input, ['label', 'optionlabel', 'featurelabel'])) || undefined,
      path: path.join('.'),
    } as JsonValue;
  }

  const child: Record<string, JsonValue> = {};
  for (const [k, v] of Object.entries(input)) {
    const r = reduceNode(v, [...path, k]);
    if (r !== undefined) child[k] = r;
  }
  return Object.keys(child).length ? child : undefined;
}

export function reduceConfigurationJsonSnapshot(input: unknown): unknown {
  const reduced = reduceNode(input, []);
  return reduced ?? {};
}
