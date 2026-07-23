// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const explain = vi.fn();

vi.mock('@web/lib/client', () => ({
  client: {
    symbols: {
      explain: (...args: unknown[]) => explain(...args),
    },
  },
}));

const { useExplainSymbol } = await import('./useExplainSymbol');

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  explain.mockReset();
});

describe('useExplainSymbol', () => {
  it('is disabled and hint-free before the first call', () => {
    const { result } = renderHook(() => useExplainSymbol('MU.US'));
    expect(result.current.pending).toBe(false);
    expect(result.current.hint).toBeNull();
  });

  it('sets pending while the request is in flight and clears it once it resolves', async () => {
    const { promise, resolve } = deferred<{ ok: true; comment: unknown }>();
    explain.mockReturnValue(promise);
    const { result } = renderHook(() => useExplainSymbol('MU.US'));

    let call: Promise<void>;
    act(() => {
      call = result.current.explain();
    });
    expect(result.current.pending).toBe(true);
    expect(explain).toHaveBeenCalledWith({ sym: 'MU.US' });

    await act(async () => {
      resolve({ ok: true, comment: {} });
      await call!;
    });
    expect(result.current.pending).toBe(false);
    expect(result.current.hint).toBeNull();
  });

  it('surfaces the busy hint without leaving the button stuck disabled', async () => {
    explain.mockResolvedValue({ ok: false, reason: 'busy' });
    const { result } = renderHook(() => useExplainSymbol('MU.US'));

    await act(async () => {
      await result.current.explain();
    });

    expect(result.current.pending).toBe(false);
    expect(result.current.hint).toBe('解读正在进行中，请稍候');
  });

  it('surfaces the disabled hint like the reassess AI-not-configured idiom', async () => {
    explain.mockResolvedValue({ ok: false, reason: 'disabled' });
    const { result } = renderHook(() => useExplainSymbol('MU.US'));

    await act(async () => {
      await result.current.explain();
    });

    expect(result.current.hint).toBe('AI 未配置（服务端缺 analyst 模型），暂时无法解读');
  });

  it('surfaces a generic failed hint', async () => {
    explain.mockResolvedValue({ ok: false, reason: 'failed' });
    const { result } = renderHook(() => useExplainSymbol('MU.US'));

    await act(async () => {
      await result.current.explain();
    });

    expect(result.current.hint).toBe('解读失败，请稍后再试');
  });

  it('resets pending and hint when the symbol changes', async () => {
    explain.mockResolvedValue({ ok: false, reason: 'busy' });
    const { result, rerender } = renderHook(({ symbol }) => useExplainSymbol(symbol), {
      initialProps: { symbol: 'MU.US' },
    });

    await act(async () => {
      await result.current.explain();
    });
    expect(result.current.hint).not.toBeNull();

    rerender({ symbol: 'NVDA.US' });
    expect(result.current.hint).toBeNull();
    expect(result.current.pending).toBe(false);
  });
});
