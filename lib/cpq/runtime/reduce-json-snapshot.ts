const CAPTIONS = new Set(['forecastas', 'description', 'detailid', 'tradeprice', 'msrp']);
const PRICE_CAPTIONS = new Set(['tradeprice', 'msrp']);
const FORECAST_AS_MIN_LENGTH = 13;
const FORECAST_AS_PREFERRED_MIN_LENGTH = 15;
const FORECAST_AS_PREFERRED_MAX_LENGTH = 30;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue | undefined };

type SnapshotEntry = {
  caption: string;
  normalizedCaption: string;
  value: unknown;
  nodePath: string;
  sourcePath: string;
  sequence: number;
  numericValue: number | null;
};

type ForecastAsCandidate = {
  value: string;
  path: string;
  sequence: number;
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const asText = (v: unknown) => String(v ?? '').trim();

export function isMeaningfulSnapshotValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  if (typeof value === 'string') {
    const t = value.trim();
    return t !== '' && t !== '0';
  }
  return true;
}

export function isValidForecastAsCode(value: unknown): boolean {
  if (!isMeaningfulSnapshotValue(value)) return false;
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  return asText(value).length >= FORECAST_AS_MIN_LENGTH;
}

export function parseSnapshotNumericValue(value: unknown): number | null {
  if (!isMeaningfulSnapshotValue(value)) return null;
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0 ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/[$£€¥,\s]/g, '');
  if (!cleaned || cleaned === '0') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : null;
}

function getCaseInsensitive(obj: Record<string, unknown>, keys: string[]): unknown {
  const map = new Map(Object.keys(obj).map((k) => [k.toLowerCase(), k] as const));
  for (const key of keys) {
    const hit = map.get(key.toLowerCase());
    if (hit) return obj[hit];
  }
  return undefined;
}

function collectEntries(input: unknown, path: string[], entries: SnapshotEntry[]): void {
  if (Array.isArray(input)) {
    input.forEach((item, index) => collectEntries(item, [...path, `[${index}]`], entries));
    return;
  }
  if (!isObject(input)) return;

  const captionRaw = getCaseInsensitive(input, ['caption', 'name', 'field']);
  const caption = asText(captionRaw);
  const normalizedCaption = caption.toLowerCase();
  const value = getCaseInsensitive(input, ['value', 'text', 'valuetext']);
  const nodePath = path.join('.');
  const sourcePath = asText(getCaseInsensitive(input, ['path'])) || nodePath;

  if (CAPTIONS.has(normalizedCaption)) {
    entries.push({
      caption,
      normalizedCaption,
      value,
      nodePath,
      sourcePath,
      sequence: entries.length,
      numericValue: parseSnapshotNumericValue(value),
    });
  }

  for (const [k, v] of Object.entries(input)) {
    collectEntries(v, [...path, k], entries);
  }
}

function maxPriceEntrySequences(entries: SnapshotEntry[]): Set<number> {
  const retained = new Set<number>();
  for (const caption of PRICE_CAPTIONS) {
    const candidates = entries.filter((entry) => entry.normalizedCaption === caption && entry.numericValue !== null);
    if (!candidates.length) continue;
    let max = candidates[0];
    for (const candidate of candidates.slice(1)) {
      if ((candidate.numericValue ?? Number.NEGATIVE_INFINITY) > (max.numericValue ?? Number.NEGATIVE_INFINITY)) {
        max = candidate;
      }
    }
    retained.add(max.sequence);
  }
  return retained;
}

function shouldRetainEntry(entry: SnapshotEntry, retainedPriceSequences: Set<number>): boolean {
  if (!CAPTIONS.has(entry.normalizedCaption)) return false;
  if (entry.normalizedCaption === 'forecastas') return isValidForecastAsCode(entry.value);
  if (PRICE_CAPTIONS.has(entry.normalizedCaption)) return retainedPriceSequences.has(entry.sequence);
  return isMeaningfulSnapshotValue(entry.value);
}

function reduceNode(input: unknown, path: string[], retainedEntrySequences: Set<number>, nextSequence: { value: number }): JsonValue | undefined {
  if (Array.isArray(input)) {
    const reduced = input
      .map((item, index) => reduceNode(item, [...path, `[${index}]`], retainedEntrySequences, nextSequence))
      .filter((item): item is JsonValue => item !== undefined);
    return reduced.length ? reduced : undefined;
  }

  if (!isObject(input)) return undefined;

  const captionRaw = getCaseInsensitive(input, ['caption', 'name', 'field']);
  const caption = asText(captionRaw);
  const normalizedCaption = caption.toLowerCase();
  const value = getCaseInsensitive(input, ['value', 'text', 'valuetext']);
  const sourcePath = asText(getCaseInsensitive(input, ['path'])) || path.join('.');

  if (CAPTIONS.has(normalizedCaption)) {
    const sequence = nextSequence.value;
    nextSequence.value += 1;
    if (retainedEntrySequences.has(sequence)) {
      return {
        caption,
        value: value as JsonValue,
        key: asText(getCaseInsensitive(input, ['key', 'id', 'field', 'name'])) || undefined,
        label: asText(getCaseInsensitive(input, ['label', 'optionlabel', 'featurelabel'])) || undefined,
        path: sourcePath,
      };
    }
  }

  const child: Record<string, JsonValue> = {};
  for (const [k, v] of Object.entries(input)) {
    const r = reduceNode(v, [...path, k], retainedEntrySequences, nextSequence);
    if (r !== undefined) child[k] = r;
  }
  return Object.keys(child).length ? child : undefined;
}

function collectForecastAsCandidates(input: unknown, candidates: ForecastAsCandidate[]): void {
  const entries: SnapshotEntry[] = [];
  collectEntries(input, [], entries);
  for (const entry of entries) {
    if (entry.normalizedCaption !== 'forecastas' || !isValidForecastAsCode(entry.value)) continue;
    candidates.push({ value: asText(entry.value), path: entry.sourcePath, sequence: entry.sequence });
  }
}

function forecastAsScore(candidate: ForecastAsCandidate): number {
  const lowerPath = candidate.path.toLowerCase();
  let score = 0;
  if (candidate.value.length >= FORECAST_AS_PREFERRED_MIN_LENGTH && candidate.value.length <= FORECAST_AS_PREFERRED_MAX_LENGTH) score += 100;
  if (lowerPath.includes('raw.details')) score += 80;
  else if (lowerPath.includes('details')) score += 60;
  if (lowerPath.includes('screenoptions')) score -= 30;
  if (lowerPath.includes('selectablevalues')) score -= 30;
  if (lowerPath.includes('customproperties')) score -= 30;
  score -= Math.abs(FORECAST_AS_PREFERRED_MIN_LENGTH - Math.min(candidate.value.length, FORECAST_AS_PREFERRED_MIN_LENGTH));
  return score;
}

export function extractPrimaryForecastAs(input: unknown): string | null {
  try {
    const candidates: ForecastAsCandidate[] = [];
    collectForecastAsCandidates(input, candidates);
    if (!candidates.length) return null;
    const sorted = [...candidates].sort((a, b) => {
      const scoreDelta = forecastAsScore(b) - forecastAsScore(a);
      if (scoreDelta !== 0) return scoreDelta;
      return a.sequence - b.sequence;
    });
    return sorted[0]?.value ?? null;
  } catch {
    return null;
  }
}

export const extractPrimaryForecastAsFromReducedSnapshot = extractPrimaryForecastAs;

export function reduceConfigurationJsonSnapshot(input: unknown): unknown {
  const entries: SnapshotEntry[] = [];
  collectEntries(input, [], entries);
  const retainedPriceSequences = maxPriceEntrySequences(entries);
  const retainedEntrySequences = new Set<number>();
  for (const entry of entries) {
    if (shouldRetainEntry(entry, retainedPriceSequences)) retainedEntrySequences.add(entry.sequence);
  }
  const reduced = reduceNode(input, [], retainedEntrySequences, { value: 0 });
  return reduced ?? {};
}
