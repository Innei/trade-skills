import { RadioTower } from "lucide-react";
import { Switch } from "../../ui";
import { useSymbolFollow } from "../../useSymbolFollow";

export function FollowAction({ symbol, revision }: { symbol: string; revision?: string }) {
  const { following, busy, statusError, change } = useSymbolFollow({ symbol, revision });

  return (
    <span
      className={`follow-control${statusError ? " follow-control--error" : ""}`}
      title={
        statusError ??
        (following
          ? "AI 评论员会在后台持续跟进；关闭此图表不会停止"
          : "AI 评论员已停止跟进此标的")
      }
    >
      <RadioTower size={13} />
      <span className="follow-control-label">AI 跟进</span>
      <Switch
        ariaLabel="持续跟进 AI 点评"
        checked={following ?? false}
        disabled={busy}
        onCheckedChange={(checked) => void change(checked)}
      />
    </span>
  );
}
