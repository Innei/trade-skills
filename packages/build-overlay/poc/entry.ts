import { Edition } from './edition.js';
import { widgetsKind, widgetsLabel } from '@poc/widgets/index.js';

export { Edition };
export const selectedEdition = new Edition().kind;

export function createEditionSummary(): string {
  return new Edition().summary();
}

export const selectedWidgets = widgetsKind;
export const widgetsSummary: string = widgetsLabel;
