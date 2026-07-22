export function addSymbol(list: string[], raw: string): string[] {
  const normalized = raw.trim().toUpperCase();
  if (!normalized) return list;
  if (list.includes(normalized)) return list;
  return [...list, normalized];
}

export function removeSymbol(list: string[], sym: string): string[] {
  return list.filter((s) => s !== sym);
}
