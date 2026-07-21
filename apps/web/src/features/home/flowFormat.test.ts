import { describe, expect, it } from 'vitest';
import { flowTone, fmtFlow } from './flowFormat';

describe('fmtFlow', () => {
  it('formats by magnitude with sign', () => {
    expect(fmtFlow(2.35e8)).toBe('+2.4亿');
    expect(fmtFlow(-6.1e4)).toBe('-6.1万');
    expect(fmtFlow(321)).toBe('+321');
    expect(fmtFlow(0)).toBe('0');
    expect(fmtFlow(null)).toBe('—');
  });
});

describe('flowTone', () => {
  it('maps sign to tone class', () => {
    expect(flowTone(5)).toBe('up');
    expect(flowTone(-5)).toBe('down');
    expect(flowTone(0)).toBe('');
    expect(flowTone(null)).toBe('');
  });
});
