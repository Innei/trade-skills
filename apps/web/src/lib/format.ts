const group = (x: number, d: number) =>
  x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmt = (x: number, d = 2) => group(x, d);

export const signed = (x: number, d = 2) => (x >= 0 ? '+' : '') + group(x, d);

export const money = (x: number, d = 2) => `$${group(x, d)}`;

export const upDown = (x: number) => (x >= 0 ? 'up' : 'down');
