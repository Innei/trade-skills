// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let capabilities: { datasources?: { market: string; name: string; realtime: boolean }[] } = {};
const navigate = vi.fn();

vi.mock('../edition/capabilitiesStore', () => ({
  useCapabilities: () => capabilities,
}));

vi.mock('../../lib/router', () => ({
  navigate: (...args: unknown[]) => navigate(...args),
}));

const { resetDelayedQuotesBannerDismissedForTests } =
  await import('./delayedQuotesBannerDismissal');
const { DelayedQuotesBanner } = await import('./DelayedQuotesBanner');

afterEach(() => {
  cleanup();
  capabilities = {};
  navigate.mockReset();
  window.localStorage.clear();
  resetDelayedQuotesBannerDismissedForTests();
});

describe('DelayedQuotesBanner', () => {
  it('renders nothing when no market is delayed', () => {
    capabilities = { datasources: [{ market: 'US', name: 'Longbridge', realtime: true }] };

    const { container } = render(<DelayedQuotesBanner />);

    expect(container.textContent).toBe('');
  });

  it('shows the banner with a settings action when a market is delayed', () => {
    capabilities = { datasources: [{ market: 'HK', name: '轮询', realtime: false }] };

    render(<DelayedQuotesBanner />);

    expect(screen.getByText(/当前行情为轮询更新/)).toBeTruthy();
    fireEvent.click(screen.getByText('去设置'));
    expect(navigate).toHaveBeenCalledWith('/settings');
  });

  it('hides once dismissed, and the dismissal persists to localStorage', () => {
    capabilities = { datasources: [{ market: 'HK', name: '轮询', realtime: false }] };

    render(<DelayedQuotesBanner />);
    fireEvent.click(screen.getByLabelText('关闭'));

    expect(screen.queryByText(/当前行情为轮询更新/)).toBeNull();
    expect(window.localStorage.getItem('kansoku.delayed-quotes-banner-dismissed')).toBe('1');
  });
});
