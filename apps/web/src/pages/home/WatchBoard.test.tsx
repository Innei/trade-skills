// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OverviewBoard, OverviewRow } from '@kansoku/shared/types';

let capabilities: { features?: Record<string, string> } = {
  features: { 'symbol-follow': 'active' },
};

vi.mock('@web/capabilitiesStore', () => ({
  useCapabilities: () => capabilities,
}));

const proSlotStub = vi.fn();
vi.mock('@web/host/useProSlot', () => ({
  useProSlot: (...args: unknown[]) => proSlotStub(...args),
}));

const { getLicenseModalStateForTests, resetLicenseModalStoreForTests } =
  await import('@web/licenseModalStore');
const { WatchBoard } = await import('./WatchBoard');

function StubControl(props: { symbol: string; initialFollowing?: boolean; compact?: boolean }) {
  return (
    <div
      data-testid={`stub-control-${props.symbol}`}
      data-following={String(props.initialFollowing)}
      data-compact={String(props.compact)}
    />
  );
}

const row: OverviewRow = {
  symbol: 'MRVL.US',
  chart_id: 'c1',
  url: '/symbol/MRVL.US',
  title: 'MRVL',
  direction: null,
  last: null,
  pct: null,
  session: null,
  entry: null,
  stop: null,
  target1: null,
  stop_distance_pct: null,
  target1_distance_pct: null,
  prediction_stale: false,
  ai_following: false,
  latest_comment: null,
  alert_count: 0,
};

const board: OverviewBoard = { date: '2026-07-18', session: 'regular', rows: [row] };

afterEach(() => {
  cleanup();
  capabilities = { features: { 'symbol-follow': 'active' } };
  resetLicenseModalStoreForTests();
  proSlotStub.mockReset();
});

describe('WatchBoard follow toggle', () => {
  it('hides the follow toggle for a community build (feature absent) while the card still renders', () => {
    capabilities = { features: { 'symbol-follow': 'absent' } };
    proSlotStub.mockReturnValue(null);
    render(<WatchBoard board={board} error={null} compact={false} />);

    expect(screen.getByText('MRVL.US')).toBeTruthy();
    expect(screen.queryByTestId('stub-control-MRVL.US')).toBeNull();
  });

  it('hides the follow toggle while capabilities are still loading', () => {
    capabilities = { features: undefined };
    proSlotStub.mockReturnValue(null);
    render(<WatchBoard board={board} error={null} compact={false} />);

    expect(screen.getByText('MRVL.US')).toBeTruthy();
    expect(screen.queryByTestId('stub-control-MRVL.US')).toBeNull();
  });

  it('renders the public locked placeholder and guards clicks when locked, without loading the pro slot component', () => {
    capabilities = { features: { 'symbol-follow': 'locked' } };
    proSlotStub.mockReturnValue(null);
    render(<WatchBoard board={board} error={null} compact={false} />);

    expect(screen.queryByTestId('stub-control-MRVL.US')).toBeNull();
    const toggle = screen.getAllByTitle('AI 跟进需要有效授权，点击订阅解锁')[0];
    fireEvent.click(toggle);

    expect(getLicenseModalStateForTests()).toEqual({ open: true, trigger: 'guard' });
  });

  it('mounts the resolved pro slot component with symbol/initialFollowing/compact props when active', () => {
    capabilities = { features: { 'symbol-follow': 'active' } };
    proSlotStub.mockReturnValue(StubControl);
    render(<WatchBoard board={board} error={null} compact={false} />);

    expect(proSlotStub).toHaveBeenCalledWith('symbol-follow.control');
    const stub = screen.getByTestId('stub-control-MRVL.US');
    expect(stub.dataset.following).toBe('false');
  });

  it('renders nothing for the toggle while active but the pro slot component has not resolved yet', () => {
    capabilities = { features: { 'symbol-follow': 'active' } };
    proSlotStub.mockReturnValue(null);
    render(<WatchBoard board={board} error={null} compact={false} />);

    expect(screen.getByText('MRVL.US')).toBeTruthy();
    expect(screen.queryByTestId('stub-control-MRVL.US')).toBeNull();
  });
});
