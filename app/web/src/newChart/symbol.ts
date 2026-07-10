const SYMBOL_RE = /^[A-Z]{1,5}(\.US)?$/;

export function normalizeSymbolInput(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidSymbolInput(symbol: string): boolean {
  return SYMBOL_RE.test(symbol);
}

export function toChartSymbol(raw: string): string | null {
  const normalized = normalizeSymbolInput(raw);
  if (!isValidSymbolInput(normalized)) return null;
  return normalized.includes(".") ? normalized : `${normalized}.US`;
}
