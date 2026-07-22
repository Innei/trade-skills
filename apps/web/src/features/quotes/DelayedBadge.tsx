import { Badge } from '../../ui';
import { isDelayedSymbol, useDelayedMarkets } from './delayedDatasource';

export function DelayedBadge({ symbol }: { symbol: string }) {
  const delayedMarkets = useDelayedMarkets();
  if (!isDelayedSymbol(delayedMarkets, symbol)) return null;

  return (
    <Badge tone="muted" className="delayed-badge">
      延迟
    </Badge>
  );
}
