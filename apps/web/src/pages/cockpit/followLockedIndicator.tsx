import { Lock, RadioTower } from 'lucide-react';
import { useFeature } from '@web/useFeature';

export function FollowLockedIndicator({
  following,
  compact,
}: {
  following?: boolean;
  compact?: boolean;
}) {
  const { guard } = useFeature('symbol-follow');
  const title = following
    ? '授权已失效，AI 跟进已暂停；重新开启需订阅'
    : 'AI 跟进需要有效授权，点击订阅解锁';

  const onClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    guard(() => {});
  };

  if (compact === undefined) {
    return (
      <span className="follow-control follow-control--locked" title={title} onClick={onClick}>
        <RadioTower size={13} />
        <span className="follow-control-label">AI 跟进</span>
        <Lock className="follow-control-lock" size={11} />
      </span>
    );
  }

  const className = [
    'symbol-card-follow',
    following && 'symbol-card-follow--active',
    'symbol-card-follow--locked',
    compact && 'symbol-card-follow--compact',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={className} title={title} onClick={onClick}>
      <RadioTower aria-hidden="true" size={compact ? 12 : 11} />
      <span className={compact ? 'sr-only' : undefined}>AI 跟进</span>
      <Lock className="follow-control-lock" size={compact ? 12 : 11} />
    </span>
  );
}
