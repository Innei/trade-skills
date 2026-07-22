import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import type { ReactElement, ReactNode } from 'react';

type TooltipPlacement = 'top' | 'bottom';

interface TooltipProps {
  children: ReactNode;
  className?: string;
  content: ReactNode;
  disabled?: boolean;
  focusable?: boolean;
  placement?: TooltipPlacement;
  renderTrigger?: ReactElement<{ className?: string; tabIndex?: number }>;
}

function hasContent(content: ReactNode): boolean {
  return content !== null && content !== undefined && content !== false && content !== '';
}

export function Tooltip({
  children,
  className,
  content,
  disabled,
  focusable = false,
  placement = 'top',
  renderTrigger,
}: TooltipProps) {
  const active = !disabled && hasContent(content);
  if (!active && !renderTrigger) return <>{children}</>;

  const trigger = renderTrigger ?? (
    <span
      className={`tooltip-anchor${className ? ` ${className}` : ''}`}
      tabIndex={focusable ? 0 : undefined}
    />
  );

  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger delay={100} disabled={!active} render={trigger}>
        {children}
      </BaseTooltip.Trigger>
      {active && (
        <BaseTooltip.Portal>
          <BaseTooltip.Positioner className="tooltip-positioner" side={placement} sideOffset={8}>
            <BaseTooltip.Popup className="tooltip-panel">{content}</BaseTooltip.Popup>
          </BaseTooltip.Positioner>
        </BaseTooltip.Portal>
      )}
    </BaseTooltip.Root>
  );
}
