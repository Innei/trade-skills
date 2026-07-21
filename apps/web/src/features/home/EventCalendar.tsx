import { useMemo, useState } from 'react';
import type { HomeEventItem, HomeEvents } from '@kansoku/shared/types';
import { MarketTime } from '@web/ui';

interface EventCalendarProps {
  events: HomeEvents | null | undefined;
  error: string | null;
  after: boolean;
}

interface DayCell {
  iso: string;
  day: number;
  inMonth: boolean;
}

interface DotDescriptor {
  kind: HomeEventItem['kind'];
  owned: boolean;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isoDate(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function parseIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

function monthGrid(year: number, month: number): DayCell[] {
  const first = new Date(year, month - 1, 1);
  const dow = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const prevDays = new Date(year, month - 1, 0).getDate();
  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const offset = i - dow;
    let y = year;
    let m = month;
    let d: number;
    if (offset < 0) {
      m -= 1;
      if (m < 1) {
        m = 12;
        y -= 1;
      }
      d = prevDays + offset + 1;
    } else if (offset < daysInMonth) {
      d = offset + 1;
    } else {
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
      d = offset - daysInMonth + 1;
    }
    cells.push({ iso: isoDate(y, m, d), day: d, inMonth: offset >= 0 && offset < daysInMonth });
  }
  return cells;
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

function weekdayOf(iso: string): string {
  const { y, m, d } = parseIso(iso);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

function dayLabel(iso: string): string {
  const { m, d } = parseIso(iso);
  return `${m}/${d} · 周${weekdayOf(iso)}`;
}

function groupDots(items: HomeEventItem[]): Map<string, DotDescriptor[]> {
  const map = new Map<string, DotDescriptor[]>();
  for (const it of items) {
    const arr = map.get(it.date);
    const dot: DotDescriptor = { kind: it.kind, owned: it.owned };
    if (arr) arr.push(dot);
    else map.set(it.date, [dot]);
  }
  return map;
}

function sortEvents(a: HomeEventItem, b: HomeEventItem): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const at = a.ts ?? '';
  const bt = b.ts ?? '';
  if (at !== bt) return at < bt ? -1 : 1;
  return a.title.localeCompare(b.title);
}

function upcomingWindow(items: HomeEventItem[], todayIso: string): HomeEventItem[] {
  const { y, m, d } = parseIso(todayIso);
  const end = new Date(y, m - 1, d + 7);
  const endIso = isoDate(end.getFullYear(), end.getMonth() + 1, end.getDate());
  return items.filter((i) => i.date >= todayIso && i.date < endIso).sort(sortEvents);
}

function eventKey(item: HomeEventItem): string {
  return `${item.kind}|${item.date}|${item.ts ?? ''}|${item.symbol ?? ''}|${item.title}`;
}

function eventDetail(item: HomeEventItem): string | null {
  const parts: string[] = [];
  if (item.actual != null) parts.push(`实际 ${item.actual}`);
  if (item.estimate != null) parts.push(`预期 ${item.estimate}`);
  if (item.previous != null) parts.push(`前值 ${item.previous}`);
  return parts.length ? parts.join(' · ') : null;
}

function DayDots({ list }: { list: DotDescriptor[] }) {
  const shown = list.slice(0, 3);
  const extra = list.length - shown.length;
  return (
    <span className="cal-day-dots">
      {shown.map((dot, i) => (
        <span
          // eslint-disable-next-line @eslint-react/no-array-index-key
          key={`${dot.kind}-${dot.owned}-${i}`}
          className={`cal-dot cal-dot--${dot.kind}${dot.owned ? ' cal-dot--owned' : ''}`}
        />
      ))}
      {extra > 0 && <span className="cal-day-more">+{extra}</span>}
    </span>
  );
}

function StripItem({ item }: { item: HomeEventItem }) {
  const done = item.kind === 'macro' && item.actual != null;
  const detail = eventDetail(item);
  return (
    <div className={`event-item event-${item.kind}${done ? ' event-done' : ''}`}>
      <span className="event-time">
        {item.ts ? <MarketTime value={item.ts} format="clock" /> : item.date.slice(5)}
      </span>
      <span className="event-body">
        <span className="event-title">
          {item.symbol ? `${item.symbol.replace(/\.US$/, '')} · ` : ''}
          {item.title}
          {item.kind === 'earnings' && item.owned && ' ⚠'}
          {done && ' ✓'}
        </span>
        {detail && <span className="event-detail">{detail}</span>}
      </span>
    </div>
  );
}

function EventStrip({
  label,
  items,
  selected,
  onClear,
}: {
  label: string;
  items: HomeEventItem[];
  selected: string | null;
  onClear: () => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, HomeEventItem[]>();
    for (const item of items) {
      const arr = map.get(item.date);
      if (arr) arr.push(item);
      else map.set(item.date, [item]);
    }
    return [...map.entries()];
  }, [items]);

  return (
    <div className="event-strip">
      <div className="event-strip-head">
        <span>{label}</span>
        {selected && (
          <button type="button" className="event-strip-clear" onClick={onClear}>
            未来 7 天
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="event-strip-empty">此段无事件</div>
      ) : (
        grouped.map(([date, group]) => (
          <div className="event-strip-group" key={date}>
            {!selected && <div className="event-strip-day">{dayLabel(date)}</div>}
            {group.map((it) => (
              <StripItem key={eventKey(it)} item={it} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}

export function EventCalendar({ events, error, after }: EventCalendarProps) {
  const todayIso = events?.date ?? isoDate(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    new Date().getDate(),
  );
  const initial = parseIso(todayIso);
  const [view, setView] = useState({ year: initial.y, month: initial.m });
  const [selected, setSelected] = useState<string | null>(null);

  const dots = useMemo(() => groupDots(events?.items ?? []), [events]);
  const days = useMemo(() => monthGrid(view.year, view.month), [view.year, view.month]);
  const inMonthHasEvents = days.some((d) => d.inMonth && dots.has(d.iso));

  const stripItems = selected
    ? (events?.items ?? []).filter((i) => i.date === selected).sort(sortEvents)
    : upcomingWindow(events?.items ?? [], todayIso);
  const stripLabel = selected
    ? dayLabel(selected)
    : after
      ? '未来 7 天 · 含今日已发生'
      : '未来 7 天';

  if (error) return <div className="note-block">事件日历获取失败，正在重试</div>;
  if (!events) return <div className="note-block">事件日历加载中…</div>;

  const goto = (delta: number) => setView((v) => shiftMonth(v.year, v.month, delta));
  const resetToday = () => {
    setView({ year: initial.y, month: initial.m });
    setSelected(null);
  };

  return (
    <div className="event-calendar">
      <div className="cal-nav">
        <button
          type="button"
          className="cal-nav-btn"
          aria-label="上月"
          onClick={() => goto(-1)}
        >
          ‹
        </button>
        <button type="button" className="cal-nav-title" onClick={resetToday}>
          {view.year} · {view.month} 月
        </button>
        <button
          type="button"
          className="cal-nav-btn"
          aria-label="下月"
          onClick={() => goto(1)}
        >
          ›
        </button>
      </div>
      <div className="cal-weekdays">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="cal-grid">
        {days.map((d) => {
          const list = dots.get(d.iso) ?? [];
          const isToday = d.iso === todayIso;
          const isSelected = d.iso === selected;
          const classes = ['cal-day'];
          if (!d.inMonth) classes.push('cal-day--other');
          if (isToday) classes.push('cal-day--today');
          if (isSelected) classes.push('cal-day--selected');
          const disabled = !d.inMonth && list.length === 0;
          return (
            <button
              type="button"
              key={`${d.iso}-${d.day}`}
              className={classes.join(' ')}
              onClick={() => setSelected(isSelected ? null : d.iso)}
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={`${d.iso}${list.length ? ` · ${list.length} 项事件` : ''}`}
            >
              <span className="cal-day-num">{d.day}</span>
              {list.length > 0 && <DayDots list={list} />}
            </button>
          );
        })}
      </div>
      {!inMonthHasEvents && (
        <div className="cal-empty-note">此月无预告事件（事件预告仅覆盖近期）</div>
      )}
      <EventStrip
        label={stripLabel}
        items={stripItems}
        selected={selected}
        onClear={() => setSelected(null)}
      />
    </div>
  );
}
