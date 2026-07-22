// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let capabilities: { datasources?: { market: string; name: string; realtime: boolean }[] } = {};

vi.mock('../edition/capabilitiesStore', () => ({
  useCapabilities: () => capabilities,
}));

const { DelayedBadge } = await import('./DelayedBadge');

afterEach(() => {
  cleanup();
  capabilities = {};
});

describe('DelayedBadge', () => {
  it('renders for a symbol whose market is delayed', () => {
    capabilities = { datasources: [{ market: 'HK', name: '轮询', realtime: false }] };

    render(<DelayedBadge symbol="700.HK" />);

    expect(screen.getByText('延迟')).toBeTruthy();
  });

  it('renders nothing for a symbol whose market is realtime', () => {
    capabilities = { datasources: [{ market: 'US', name: 'Longbridge', realtime: true }] };

    const { container } = render(<DelayedBadge symbol="MU.US" />);

    expect(container.textContent).toBe('');
  });
});
