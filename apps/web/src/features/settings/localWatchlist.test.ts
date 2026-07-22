import { describe, expect, it } from 'vitest';
import { addSymbol, removeSymbol } from './localWatchlist';

describe('addSymbol', () => {
  it('trims and uppercases the input', () => {
    expect(addSymbol([], '  mu  ')).toEqual(['MU']);
  });

  it('rejects an empty or whitespace-only input', () => {
    expect(addSymbol(['MU'], '   ')).toEqual(['MU']);
    expect(addSymbol(['MU'], '')).toEqual(['MU']);
  });

  it('rejects a duplicate already in the list, case-insensitively', () => {
    expect(addSymbol(['MU'], 'mu')).toEqual(['MU']);
    expect(addSymbol(['MU'], 'MU')).toEqual(['MU']);
  });

  it('appends a new symbol to the end of the list', () => {
    expect(addSymbol(['MU'], 'nvda')).toEqual(['MU', 'NVDA']);
  });
});

describe('removeSymbol', () => {
  it('removes the matching symbol', () => {
    expect(removeSymbol(['MU', 'NVDA'], 'MU')).toEqual(['NVDA']);
  });

  it('is a no-op when the symbol is absent', () => {
    expect(removeSymbol(['MU'], 'NVDA')).toEqual(['MU']);
  });
});
