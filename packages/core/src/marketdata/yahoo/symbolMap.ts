import { ClientError } from '../../platform/errors.js';
import { marketOf, normalizeSymbol, type Market } from '../../symbols/symbol.utils.js';

interface YahooMarketMapping {
  toYahoo(normalized: string): string;
  fromYahoo(yahooSymbol: string): string;
}

const UNSUPPORTED_HINT = 'market not supported by the yahoo provider yet';

function unsupported(symbol: string): ClientError {
  return new ClientError(`symbol not supported by yahoo provider: ${symbol}`, UNSUPPORTED_HINT);
}

const usMapping: YahooMarketMapping = {
  toYahoo: (normalized) => {
    const base = normalized.endsWith('.US') ? normalized.slice(0, -3) : normalized;
    const isIndexProxy = base.startsWith('.');
    const name = isIndexProxy ? base.slice(1) : base;
    return (isIndexProxy ? '^' : '') + name.replaceAll('.', '-');
  },
  fromYahoo: (yahooSymbol) => {
    if (yahooSymbol.startsWith('^')) {
      const name = yahooSymbol.slice(1);
      if (!name) throw unsupported(yahooSymbol);
      return `.${name}.US`;
    }
    if (!yahooSymbol) throw unsupported(yahooSymbol);
    return `${yahooSymbol.replaceAll('-', '.')}.US`;
  },
};

const marketMappings: Partial<Record<Market, YahooMarketMapping>> = {
  US: usMapping,
};

export function toYahooSymbol(canonical: string): string {
  const normalized = normalizeSymbol(canonical);
  const mapping = marketMappings[marketOf(normalized)];
  if (!mapping) throw unsupported(normalized);
  const yahooSymbol = mapping.toYahoo(normalized);
  if (!yahooSymbol) throw unsupported(normalized);
  return yahooSymbol;
}

export function fromYahooSymbol(yahooSymbol: string): string {
  if (yahooSymbol.includes('.')) throw unsupported(yahooSymbol);
  return marketMappings.US!.fromYahoo(yahooSymbol);
}
