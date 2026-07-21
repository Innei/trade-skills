import type { KeyboardEvent } from 'react';
import type { EpisodeReportActionRecordView } from '../types';

function activateOnKey(event: KeyboardEvent, handler: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    handler();
  }
}

export function ActionsList({
  actions,
  activeStep,
  onToggle,
}: {
  actions: EpisodeReportActionRecordView[];
  activeStep: number | null;
  onToggle: (record: EpisodeReportActionRecordView) => void;
}) {
  return (
    <details className="actions">
      <summary>
        回放动作与理由 <span>{actions.length}</span>
      </summary>
      {actions.length === 0 ? (
        <p>没有动作记录</p>
      ) : (
        <ol>
          {actions.map((record) => {
            const selectable = record.chartTimes != null;
            const select = () => onToggle(record);
            return (
              <li
                key={record.step}
                {...(selectable
                  ? {
                      'data-action-select': '',
                      role: 'button',
                      tabIndex: 0,
                      className: activeStep === record.step ? 'active' : undefined,
                      onClick: select,
                      onKeyDown: (event: KeyboardEvent) => activateOnKey(event, select),
                    }
                  : {})}
              >
                <span>{String(record.step).padStart(2, '0')}</span>
                <div>
                  <strong>
                    {record.actionLabel} · {record.reasonCategoryLabel ?? '未记录理由'}
                  </strong>
                  {record.reasonSummary ? <small>{record.reasonSummary}</small> : null}
                  <em>{record.timeLabel}</em>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </details>
  );
}