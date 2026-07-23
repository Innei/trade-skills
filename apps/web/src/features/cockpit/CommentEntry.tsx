import type { CockpitComment, CommentStance } from '@kansoku/shared/types';
import { marketOfSymbol } from '@web/lib/market';
import { Badge, MarketTime } from '@web/ui';
import { symbolUrl } from './analysisMode';
import { Markdown } from './markdown';

const LEVEL_LABEL: Record<string, string> = {
  info: 'info',
  warn: 'warn',
  alert: 'alert',
  error: 'error',
};
const LEVEL_TONE: Record<string, 'up' | 'down' | 'accent' | 'solid' | undefined> = {
  info: undefined,
  warn: 'accent',
  alert: 'down',
  error: 'solid',
};
const SOURCE_LABEL: Record<string, string> = { analyst: '分析员', system: '系统' };

const STANCE_LABEL: Record<CommentStance, string> = {
  act_per_plan: '按计划执行',
  wait_confirm: '等确认',
  no_action: '不构成动作',
};
const STANCE_TONE: Record<CommentStance, 'up' | 'accent' | 'muted'> = {
  act_per_plan: 'up',
  wait_confirm: 'accent',
  no_action: 'muted',
};

function LevelBadge({ level }: { level: string }) {
  return (
    <Badge tone={LEVEL_TONE[level]} className="level-badge">
      {LEVEL_LABEL[level] ?? level}
    </Badge>
  );
}

function StanceLine({ stance, note }: { stance: CommentStance; note?: string }) {
  return (
    <p className="ai-stance">
      <Badge tone={STANCE_TONE[stance]} className="stance-badge">
        {STANCE_LABEL[stance]}
      </Badge>
      {note}
    </p>
  );
}

function CommentMeta({ symbol, comment }: { symbol: string; comment: CockpitComment }) {
  const meta: React.ReactNode[] = [];
  if (comment.trigger) meta.push(<span key="trigger">触发：{comment.trigger}</span>);
  if (comment.escalated) meta.push(<span key="escalated">已升级重估</span>);
  if (comment.chartId)
    meta.push(
      <a key="chart" href={symbolUrl(symbol, comment.chartId)}>
        查看图表
      </a>,
    );
  if (SOURCE_LABEL[comment.source])
    meta.push(<span key="source">{SOURCE_LABEL[comment.source]}</span>);
  if (meta.length === 0) return null;

  return (
    <div className="ai-meta">
      {meta.map((m, i) => (
        <span key={i}>
          {i > 0 && <span className="sep"> · </span>}
          {m}
        </span>
      ))}
    </div>
  );
}

export function CommentEntry({ symbol, comment }: { symbol: string; comment: CockpitComment }) {
  const market = marketOfSymbol(symbol);
  const dim = comment.source === 'commentator' && comment.level === 'info';

  if (comment.source === 'explainer') {
    return (
      <div className="ai-item ai-item--explainer">
        <MarketTime className="t" value={comment.ts} format="clock" market={market} />
        <div className="body">
          {comment.stance && <StanceLine stance={comment.stance} note={comment.stanceNote} />}
          <div className="ai-explainer-card">
            <Markdown variant="report">{comment.text}</Markdown>
          </div>
          <CommentMeta symbol={symbol} comment={comment} />
        </div>
      </div>
    );
  }

  if (comment.read != null && comment.stance != null) {
    return (
      <div className={`ai-item${dim ? ' dim' : ''}`}>
        <MarketTime className="t" value={comment.ts} format="clock" market={market} />
        <div className="body">
          <p className="ai-fact">
            <LevelBadge level={comment.level} />
            {comment.text}
          </p>
          <p className="ai-read">{comment.read}</p>
          <StanceLine stance={comment.stance} note={comment.stanceNote} />
          <CommentMeta symbol={symbol} comment={comment} />
        </div>
      </div>
    );
  }

  return (
    <div className={`ai-item${dim ? ' dim' : ''}`}>
      <MarketTime className="t" value={comment.ts} format="clock" market={market} />
      <div className="body">
        <p>
          <LevelBadge level={comment.level} />
          {comment.text}
        </p>
        <CommentMeta symbol={symbol} comment={comment} />
      </div>
    </div>
  );
}
