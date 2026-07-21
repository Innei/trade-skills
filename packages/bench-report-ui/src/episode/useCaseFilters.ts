import { useMemo, useState } from 'react';
import type { EpisodeReportCaseRowView } from '../types';

export interface CaseFiltersState {
  model: string;
  mode: string;
  outcome: string;
  search: string;
  setModel: (value: string) => void;
  setMode: (value: string) => void;
  setOutcome: (value: string) => void;
  setSearch: (value: string) => void;
  isVisible: (index: number) => boolean;
  visibleCount: number;
  total: number;
}

export function useCaseFilters(cases: EpisodeReportCaseRowView[]): CaseFiltersState {
  const [model, setModel] = useState('');
  const [mode, setMode] = useState('');
  const [outcome, setOutcome] = useState('');
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const set = new Set<number>();
    for (const row of cases) {
      const show =
        (!model || row.model === model) &&
        (!mode || row.mode === mode) &&
        (!outcome || row.outcome === outcome) &&
        (!query || row.filterSearch.includes(query));
      if (show) set.add(row.index);
    }
    return set;
  }, [cases, model, mode, outcome, search]);

  return {
    model,
    mode,
    outcome,
    search,
    setModel,
    setMode,
    setOutcome,
    setSearch,
    isVisible: (index: number) => visible.has(index),
    visibleCount: visible.size,
    total: cases.length,
  };
}