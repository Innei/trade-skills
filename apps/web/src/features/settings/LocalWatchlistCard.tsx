import { useState } from 'react';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { Button, Card, Input, SectionTitle } from '@web/ui';
import { addSymbol, removeSymbol } from './localWatchlist';
import { useSaveQueue } from './useSaveQueue';

export function LocalWatchlistCard() {
  const { data, error, reload } = useQuery<{ symbols: string[] }>(
    'settings.getLocalWatchlist',
    () => client.settings.getLocalWatchlist(),
  );

  if (!data) return null;
  return <LocalWatchlistCardLoaded initial={data.symbols} onReload={reload} error={error} />;
}

function LocalWatchlistCardLoaded({
  initial,
  onReload,
  error,
}: {
  initial: string[];
  onReload: () => void;
  error: string | null;
}) {
  const [symbols, setSymbols] = useState<string[]>(initial);
  const [draft, setDraft] = useState('');

  const queue = useSaveQueue<string[]>({
    initial,
    save: async (snapshot) => {
      const res = await client.settings.putLocalWatchlist({ symbols: snapshot });
      return res.symbols;
    },
    onError: (_err, rolledBackTo) => {
      setSymbols(rolledBackTo ?? initial);
      onReload();
    },
  });

  const handleAdd = () => {
    const next = addSymbol(symbols, draft);
    if (next === symbols) return;
    setSymbols(next);
    setDraft('');
    queue.push(next);
  };

  const handleRemove = (sym: string) => {
    const next = removeSymbol(symbols, sym);
    setSymbols(next);
    queue.push(next);
  };

  return (
    <Card className="settings-display-card">
      <div className="settings-card-heading">
        <SectionTitle>本地自选</SectionTitle>
      </div>
      <div className="settings-time-preference">
        <div className="settings-preference-copy">
          <div className="settings-preference-description">
            没有长桥账户时,行情关注列表来自这里。
          </div>
        </div>
      </div>
      {symbols.length > 0 && (
        <div className="local-watchlist-chips">
          {symbols.map((sym) => (
            <span className="local-watchlist-chip" key={sym}>
              {sym}
              <button
                type="button"
                className="local-watchlist-chip-remove"
                aria-label={`移除 ${sym}`}
                onClick={() => handleRemove(sym)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="local-watchlist-add-row">
        <Input
          placeholder="输入代码，如 MU"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
          }}
        />
        <Button onClick={handleAdd}>添加</Button>
      </div>
      {error ? (
        <div className="settings-time-preference">
          <div className="settings-preference-copy">
            <div className="settings-preference-description">{error}</div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
