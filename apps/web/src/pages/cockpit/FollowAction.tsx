import { useFeature } from '@web/useFeature';
import { useProSlot } from '@web/host/useProSlot';
import { FollowLockedIndicator } from './followLockedIndicator';

export interface FollowControlProps {
  symbol: string;
  revision?: string;
  initialFollowing?: boolean;
  compact?: boolean;
}

export function FollowAction({ symbol, revision }: { symbol: string; revision?: string }) {
  const { state } = useFeature('symbol-follow');
  const Control = useProSlot<FollowControlProps>('symbol-follow.control');

  if (state === 'absent') return null;
  if (state === 'locked') return <FollowLockedIndicator />;
  if (!Control) return null;
  return <Control symbol={symbol} revision={revision} />;
}
