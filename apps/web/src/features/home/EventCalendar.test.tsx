// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { HomeEvents } from '@kansoku/shared/types';
import { EventCalendar } from './EventCalendar';

afterEach(() => cleanup());

const events: HomeEvents = {
  date: '2026-07-21',
  items: [
    {
      date: '2026-07-21',
      ts: null,
      kind: 'macro',
      symbol: null,
      title: 'FOMC 会议纪要',
      estimate: null,
      previous: null,
      actual: null,
      owned: false,
    },
    {
      date: '2026-07-22',
      ts: null,
      kind: 'earnings',
      symbol: 'MSFT.US',
      title: 'Microsoft Q4',
      estimate: null,
      previous: null,
      actual: null,
      owned: true,
    },
    {
      date: '2026-07-24',
      ts: null,
      kind: 'earnings',
      symbol: 'AMD.US',
      title: 'AMD Q2',
      estimate: null,
      previous: null,
      actual: null,
      owned: true,
    },
    {
      date: '2026-08-05',
      ts: null,
      kind: 'earnings',
      symbol: 'META.US',
      title: 'Meta Q2',
      estimate: null,
      previous: null,
      actual: null,
      owned: false,
    },
  ],
};

describe('EventCalendar', () => {
  it('renders month header and defaults to upcoming 7 days', () => {
    render(<EventCalendar events={events} error={null} after={false} />);
    expect(screen.getByText('2026 · 7 月')).toBeTruthy();
    expect(screen.getByText('未来 7 天')).toBeTruthy();
    expect(screen.getByText(/Microsoft Q4/)).toBeTruthy();
    expect(screen.getByText(/AMD Q2/)).toBeTruthy();
    expect(screen.queryByText(/Meta Q2/)).toBeNull();
  });

  it('selecting a date filters the strip and can be cleared', () => {
    render(<EventCalendar events={events} error={null} after={false} />);
    const cell = screen.getByRole('button', { name: /2026-07-24/ });
    fireEvent.click(cell);
    expect(screen.getByText('7/24 · 周五')).toBeTruthy();
    expect(screen.getByText(/AMD Q2/)).toBeTruthy();
    expect(screen.queryByText(/Microsoft Q4/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '未来 7 天' }));
    expect(screen.getByText(/Microsoft Q4/)).toBeTruthy();
  });

  it('navigates months and shows an empty note when the month has no events', () => {
    render(<EventCalendar events={events} error={null} after={false} />);
    fireEvent.click(screen.getByRole('button', { name: '下月' }));
    expect(screen.getByText('2026 · 8 月')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '下月' }));
    expect(screen.getByText('2026 · 9 月')).toBeTruthy();
    expect(screen.getByText(/此月无预告事件/)).toBeTruthy();
  });

  it('shows loading state before events arrive', () => {
    render(<EventCalendar events={null} error={null} after={false} />);
    expect(screen.getByText('事件日历加载中…')).toBeTruthy();
  });

  it('shows error state when fetch fails', () => {
    render(<EventCalendar events={null} error="boom" after={false} />);
    expect(screen.getByText('事件日历获取失败，正在重试')).toBeTruthy();
  });

  it('flags owned earnings in the strip', () => {
    render(<EventCalendar events={events} error={null} after={false} />);
    const item = screen.getByText(/MSFT · Microsoft Q4/);
    expect(item.textContent).toContain('⚠');
  });
});
