function fmtMagnitude(abs: number): string {
  if (abs >= 1e8) return `${(abs / 1e8).toFixed(1)}亿`;
  if (abs >= 1e4) return `${(abs / 1e4).toFixed(1)}万`;
  return abs.toFixed(0);
}

export function fmtFlow(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${fmtMagnitude(Math.abs(value))}`;
}

export function fmtFlowLabeled(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '净流入 —';
  const label = value < 0 ? '净流出' : '净流入';
  return `${label} ${fmtMagnitude(Math.abs(value))}`;
}

export function flowTone(value: number | null): 'up' | 'down' | '' {
  if (value == null || value === 0) return '';
  return value > 0 ? 'up' : 'down';
}
