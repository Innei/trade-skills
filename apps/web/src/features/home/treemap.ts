export interface TreemapInput {
  key: string;
  value: number;
}

export interface TreemapRect {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Scaled {
  key: string;
  value: number;
}

export function squarify(
  items: TreemapInput[],
  width: number,
  height: number,
): TreemapRect[] {
  if (width <= 0 || height <= 0) return [];
  const positive = items.filter((i) => i.value > 0);
  if (!positive.length) return [];
  const total = positive.reduce((s, i) => s + i.value, 0);
  const scale = (width * height) / total;
  const scaled: Scaled[] = positive
    .map((i) => ({ key: i.key, value: i.value * scale }))
    .sort((a, b) => b.value - a.value);
  const out: TreemapRect[] = [];
  layoutRow(scaled, { x: 0, y: 0, w: width, h: height }, out);
  return out;
}

function layoutRow(items: Scaled[], rect: Rect, out: TreemapRect[]): void {
  if (!items.length || rect.w <= 0 || rect.h <= 0) return;
  if (items.length === 1) {
    out.push({ key: items[0].key, x: rect.x, y: rect.y, w: rect.w, h: rect.h });
    return;
  }
  const side = Math.min(rect.w, rect.h);
  const row: Scaled[] = [];
  let idx = 0;
  while (idx < items.length) {
    const next = [...row, items[idx]];
    if (row.length === 0 || worst(next, side) <= worst(row, side)) {
      row.push(items[idx]);
      idx += 1;
    } else break;
  }
  const rowSum = row.reduce((s, i) => s + i.value, 0);
  if (rect.w >= rect.h) {
    const bandW = rowSum / rect.h;
    let y = rect.y;
    for (const item of row) {
      const h = item.value / bandW;
      out.push({ key: item.key, x: rect.x, y, w: bandW, h });
      y += h;
    }
    layoutRow(
      items.slice(idx),
      { x: rect.x + bandW, y: rect.y, w: rect.w - bandW, h: rect.h },
      out,
    );
  } else {
    const bandH = rowSum / rect.w;
    let x = rect.x;
    for (const item of row) {
      const w = item.value / bandH;
      out.push({ key: item.key, x, y: rect.y, w, h: bandH });
      x += w;
    }
    layoutRow(
      items.slice(idx),
      { x: rect.x, y: rect.y + bandH, w: rect.w, h: rect.h - bandH },
      out,
    );
  }
}

function worst(row: Scaled[], side: number): number {
  if (!row.length) return Infinity;
  let sum = 0;
  let max = -Infinity;
  let min = Infinity;
  for (const i of row) {
    sum += i.value;
    if (i.value > max) max = i.value;
    if (i.value < min) min = i.value;
  }
  const s2 = sum * sum;
  const w2 = side * side;
  return Math.max((w2 * max) / s2, s2 / (w2 * min));
}
