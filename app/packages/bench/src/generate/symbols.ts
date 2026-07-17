export interface SymbolSpec {
  symbol: string;
  layer: "high-vol-tech" | "mega-blue-chip" | "defensive" | "cyclical" | "index-etf";
  companyQuery?: string | null;
  cik?: string | null;
}

export const DEFAULT_SYMBOLS: SymbolSpec[] = [
  { symbol: "MU.US", layer: "high-vol-tech", companyQuery: "Micron Technology", cik: "0000723125" },
  { symbol: "NVDA.US", layer: "high-vol-tech", companyQuery: "Nvidia", cik: "0001045810" },
  { symbol: "MRVL.US", layer: "high-vol-tech", companyQuery: "Marvell Technology", cik: "0001835632" },
  { symbol: "AMD.US", layer: "high-vol-tech", companyQuery: "Advanced Micro Devices", cik: "0000002488" },
  { symbol: "PLTR.US", layer: "high-vol-tech", companyQuery: "Palantir Technologies", cik: "0001321655" },
  { symbol: "TSLA.US", layer: "high-vol-tech", companyQuery: "Tesla Inc", cik: "0001318605" },
  { symbol: "MSFT.US", layer: "mega-blue-chip", companyQuery: "Microsoft", cik: "0000789019" },
  { symbol: "AAPL.US", layer: "mega-blue-chip", companyQuery: "Apple Inc", cik: "0000320193" },
  { symbol: "GOOGL.US", layer: "mega-blue-chip", companyQuery: "Alphabet Google", cik: "0001652044" },
  { symbol: "JPM.US", layer: "mega-blue-chip", companyQuery: "JPMorgan Chase", cik: "0000019617" },
  { symbol: "UNH.US", layer: "mega-blue-chip", companyQuery: "UnitedHealth Group", cik: "0000731766" },
  { symbol: "KO.US", layer: "defensive", companyQuery: "Coca-Cola Company", cik: "0000021344" },
  { symbol: "PG.US", layer: "defensive", companyQuery: "Procter & Gamble", cik: "0000080424" },
  { symbol: "XOM.US", layer: "cyclical", companyQuery: "Exxon Mobil", cik: "0000034088" },
  { symbol: "CAT.US", layer: "cyclical", companyQuery: "Caterpillar Inc", cik: "0000018230" },
  { symbol: "FCX.US", layer: "cyclical", companyQuery: "Freeport-McMoRan", cik: "0000831259" },
  { symbol: "SPY.US", layer: "index-etf", companyQuery: null, cik: null },
  { symbol: "QQQ.US", layer: "index-etf", companyQuery: null, cik: null },
  { symbol: "SMH.US", layer: "index-etf", companyQuery: null, cik: null },
  { symbol: "IWM.US", layer: "index-etf", companyQuery: null, cik: null },
];

export function layerForSymbol(symbol: string): SymbolSpec["layer"] {
  return specForSymbol(symbol).layer;
}

export function specForSymbol(symbol: string): SymbolSpec {
  const found = DEFAULT_SYMBOLS.find((s) => s.symbol === symbol);
  if (!found) throw new Error(`unknown symbol ${symbol}: not in the default 20-name universe`);
  return found;
}
