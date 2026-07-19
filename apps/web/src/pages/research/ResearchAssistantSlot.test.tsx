// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResearchDocument, ResearchDocumentMeta } from '@kansoku/core/contract/index';

let capabilities: { features?: Record<string, string> } = { features: { 'research-ai': 'active' } };
let slotComponent: ComponentType<Record<string, unknown>> | null = null;
let lastSlotProps: Record<string, unknown> | null = null;

vi.mock('@web/capabilitiesStore', () => ({
  useCapabilities: () => capabilities,
}));
vi.mock('@web/host/useProSlot', () => ({
  useProSlot: () => slotComponent,
}));

const { ResearchAssistantSlot } = await import('./ResearchPage');

const document: ResearchDocument = {
  path: 'stocks/MRVL.md',
  kind: 'stock',
  type: 'stock',
  title: 'MRVL',
  date: null,
  symbols: ['MRVL'],
  mtime: '2026-07-18T00:00:00.000Z',
  excerpt: '',
  markdown: '# MRVL',
  revision: 'r1',
};

const related: ResearchDocumentMeta[] = [
  {
    path: 'stocks/AVGO.md',
    kind: 'stock',
    type: 'stock',
    title: 'AVGO',
    date: null,
    symbols: ['AVGO'],
    mtime: '2026-07-18T00:00:00.000Z',
    excerpt: '',
  },
];

function renderSlot() {
  return render(
    <ResearchAssistantSlot
      document={document}
      selected={document}
      related={related}
      onSelect={vi.fn()}
      onDocumentChanged={vi.fn()}
    />,
  );
}

beforeEach(() => {
  lastSlotProps = null;
  slotComponent = (props: Record<string, unknown>) => {
    lastSlotProps = props;
    return <div data-testid="assistant-slot">{props.relatedCard as ReactNode}</div>;
  };
});

afterEach(() => {
  cleanup();
  capabilities = { features: { 'research-ai': 'active' } };
});

describe('ResearchAssistantSlot gate', () => {
  it('community build (absent): renders the browse card only, no locked notice, no pro slot', () => {
    capabilities = { features: { 'research-ai': 'absent' } };
    renderSlot();

    expect(screen.getByText(/关联资料/)).toBeTruthy();
    expect(screen.queryByText(/研究库 AI/)).toBeNull();
    expect(screen.queryByText('订阅解锁')).toBeNull();
    expect(screen.queryByTestId('assistant-slot')).toBeNull();
  });

  it('locked: renders the browse card plus the LockedAiNotice, no pro slot', () => {
    capabilities = { features: { 'research-ai': 'locked' } };
    renderSlot();

    expect(screen.getByText(/关联资料/)).toBeTruthy();
    expect(screen.getByText(/研究库 AI/)).toBeTruthy();
    expect(screen.getByText('订阅解锁')).toBeTruthy();
    expect(screen.queryByTestId('assistant-slot')).toBeNull();
  });

  it('active: renders the resolved pro slot with document, onDocumentChanged and relatedCard props', () => {
    capabilities = { features: { 'research-ai': 'active' } };
    const onDocumentChanged = vi.fn();
    render(
      <ResearchAssistantSlot
        document={document}
        selected={document}
        related={related}
        onSelect={vi.fn()}
        onDocumentChanged={onDocumentChanged}
      />,
    );

    expect(screen.getByTestId('assistant-slot')).toBeTruthy();
    expect(screen.queryByText(/研究库 AI/)).toBeNull();
    expect(lastSlotProps?.document).toBe(document);
    expect(lastSlotProps?.onDocumentChanged).toBe(onDocumentChanged);
    expect(lastSlotProps?.relatedCard).toBeTruthy();
    expect(screen.getByText(/关联资料/)).toBeTruthy();
  });

  it('active but pro slot not yet resolved: renders nothing', () => {
    capabilities = { features: { 'research-ai': 'active' } };
    slotComponent = null;
    const { container } = renderSlot();

    expect(container.childElementCount).toBe(0);
    expect(screen.queryByText(/关联资料/)).toBeNull();
  });
});
