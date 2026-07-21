export const EMA_PERIOD = 20;

export interface EmaPoint {
  index: number;
  value: number;
}

export function computeEma20(closes: number[]): EmaPoint[] {
  if (closes.length < EMA_PERIOD) return [];
  const multiplier = 2 / (EMA_PERIOD + 1);
  let seed = 0;
  for (let i = 0; i < EMA_PERIOD; i += 1) seed += closes[i];
  seed /= EMA_PERIOD;
  const points: EmaPoint[] = [{ index: EMA_PERIOD - 1, value: seed }];
  let previous = seed;
  for (let i = EMA_PERIOD; i < closes.length; i += 1) {
    previous = closes[i] * multiplier + previous * (1 - multiplier);
    points.push({ index: i, value: previous });
  }
  return points;
}