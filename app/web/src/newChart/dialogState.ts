import { type PresetId } from "./presets";
import { toChartSymbol } from "./symbol";
import type { ChartCreateError } from "./chartError";

export interface NewChartState {
  symbolInput: string;
  presetId: PresetId;
  status: "idle" | "submitting";
  error: ChartCreateError | null;
}

export type NewChartAction =
  | { type: "setSymbol"; value: string }
  | { type: "setPreset"; value: PresetId }
  | { type: "submitStart" }
  | { type: "submitFailure"; error: ChartCreateError };

export function initialNewChartState(defaultPreset: PresetId): NewChartState {
  return { symbolInput: "", presetId: defaultPreset, status: "idle", error: null };
}

export function newChartReducer(state: NewChartState, action: NewChartAction): NewChartState {
  switch (action.type) {
    case "setSymbol":
      return { ...state, symbolInput: action.value, error: null };
    case "setPreset":
      return { ...state, presetId: action.value, error: null };
    case "submitStart":
      return { ...state, status: "submitting", error: null };
    case "submitFailure":
      return { ...state, status: "idle", error: action.error };
  }
}

export function canSubmitNewChart(state: NewChartState): boolean {
  return state.status !== "submitting" && toChartSymbol(state.symbolInput) !== null;
}
