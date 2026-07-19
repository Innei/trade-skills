// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
const { FollowAction } = await import('./FollowAction');

function StubControl(props: { symbol: string; revision?: string }) {
  return <div data-testid="stub-control" data-symbol={props.symbol} data-revision={props.revision ?? ''} />;
}

afterEach(() => {
  cleanup();
  capabilities = { features: { 'symbol-follow': 'active' } };
  resetLicenseModalStoreForTests();
  proSlotStub.mockReset();
});

describe('FollowAction', () => {
  it('renders nothing for a community build (feature absent)', () => {
    capabilities = { features: { 'symbol-follow': 'absent' } };
    proSlotStub.mockReturnValue(null);
    const { container } = render(<FollowAction symbol="MRVL.US" />);

    expect(container.innerHTML).toBe('');
  });

  it('renders nothing while capabilities are still loading', () => {
    capabilities = { features: undefined };
    proSlotStub.mockReturnValue(null);
    const { container } = render(<FollowAction symbol="MRVL.US" />);

    expect(container.innerHTML).toBe('');
  });

  it('renders the public locked placeholder and guards clicks when locked, without loading the pro slot component', () => {
    capabilities = { features: { 'symbol-follow': 'locked' } };
    proSlotStub.mockReturnValue(null);
    render(<FollowAction symbol="MRVL.US" />);

    expect(screen.queryByTestId('stub-control')).toBeNull();
    const placeholder = screen.getByText('AI 跟进');
    fireEvent.click(placeholder.closest('span')!);

    expect(getLicenseModalStateForTests()).toEqual({ open: true, trigger: 'guard' });
  });

  it('mounts the resolved pro slot component with the symbol/revision props when active', () => {
    capabilities = { features: { 'symbol-follow': 'active' } };
    proSlotStub.mockReturnValue(StubControl);
    render(<FollowAction symbol="MRVL.US" revision="r1" />);

    expect(proSlotStub).toHaveBeenCalledWith('symbol-follow.control');
    const stub = screen.getByTestId('stub-control');
    expect(stub.dataset.symbol).toBe('MRVL.US');
    expect(stub.dataset.revision).toBe('r1');
  });

  it('renders nothing while active but the pro slot component has not resolved yet', () => {
    capabilities = { features: { 'symbol-follow': 'active' } };
    proSlotStub.mockReturnValue(null);
    const { container } = render(<FollowAction symbol="MRVL.US" />);

    expect(container.innerHTML).toBe('');
  });
});
