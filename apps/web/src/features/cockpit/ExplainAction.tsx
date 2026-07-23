import { Button, Spinner } from '@web/ui';
import { useExplainSymbol } from './useExplainSymbol';

export function ExplainAction({ symbol }: { symbol: string }) {
  const { pending, hint, explain } = useExplainSymbol(symbol);

  return (
    <>
      <Button onClick={explain} disabled={pending}>
        {pending && <Spinner />}
        {pending ? '解读中…' : '解读当前盘面'}
      </Button>
      {hint && <span className="ai-hint">{hint}</span>}
    </>
  );
}
