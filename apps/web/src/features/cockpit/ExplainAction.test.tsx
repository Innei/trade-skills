// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const explain = vi.fn();

vi.mock('@web/lib/client', () => ({
  client: {
    symbols: {
      explain: (...args: unknown[]) => explain(...args),
    },
  },
}));

const { ExplainAction } = await import('./ExplainAction');

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

describe('ExplainAction', () => {
  it('calls the explain transport for the symbol on click', () => {
    explain.mockReturnValue(new Promise(() => {}));
    render(<ExplainAction symbol="MU.US" />);

    fireEvent.click(screen.getByText('解读当前盘面'));

    expect(explain).toHaveBeenCalledWith({ sym: 'MU.US' });
  });

  it('disables the button and shows the running label while in flight', async () => {
    const { promise, resolve } = deferred<{ ok: true; comment: unknown }>();
    explain.mockReturnValue(promise);
    render(<ExplainAction symbol="MU.US" />);

    fireEvent.click(screen.getByText('解读当前盘面'));

    const button = screen.getByRole('button');
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('解读中…')).toBeTruthy();

    await act(async () => {
      resolve({ ok: true, comment: {} });
      await promise;
    });
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(false);
    expect(screen.getByText('解读当前盘面')).toBeTruthy();
  });

  it('shows the busy hint and re-enables the button when the server reports busy', async () => {
    explain.mockResolvedValue({ ok: false, reason: 'busy' });
    render(<ExplainAction symbol="MU.US" />);

    fireEvent.click(screen.getByText('解读当前盘面'));

    expect(await screen.findByText('解读正在进行中，请稍候')).toBeTruthy();
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(false);
  });

  it('shows the AI-not-configured hint when the server reports disabled', async () => {
    explain.mockResolvedValue({ ok: false, reason: 'disabled' });
    render(<ExplainAction symbol="MU.US" />);

    fireEvent.click(screen.getByText('解读当前盘面'));

    expect(await screen.findByText('AI 未配置（服务端缺点评模型），暂时无法解读')).toBeTruthy();
  });
});
