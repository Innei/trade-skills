import { formatClockInZone, localTimeZone } from '@kansoku/shared/time';
import { useFeature } from '@web/features/edition/useFeature';
import { useSymbolFollow } from '@web/features/quotes/useSymbolFollow';
import { useFollowTick } from './useFollowTick';

export function AliveLine({ symbol, revision }: { symbol: string; revision?: string }) {
  const { active } = useFeature('symbol-follow');
  const { following } = useSymbolFollow({ symbol, revision });
  const enabled = active && following === true;
  const tick = useFollowTick(symbol, enabled);

  if (!enabled || !tick) return null;

  return (
    <div className="ai-alive-line">
      跟进中 · 上次检测 {formatClockInZone(tick.at, localTimeZone())}
    </div>
  );
}
