import type { SymbolAnalysisRow } from "../../../../shared/types";
import { formatMarketMonthDayTime } from "../../../../shared/time";
import { DIRECTION_LABEL } from "../../charts/intraday/directionLabels";
import { Select } from "../../ui";

export function AnalysisTimeline({
  rows,
  activeId,
  mode,
  onSelect,
}: {
  rows: SymbolAnalysisRow[];
  activeId: string | null;
  mode: "latest" | "pinned";
  onSelect: (id: string | null) => void;
}) {
  if (rows.length === 0) return null;
  const options = [
    { value: "latest", label: "最新" },
    ...rows.map((row) => ({
      value: row.id,
      label: `${formatMarketMonthDayTime(row.created_at)}${row.direction ? ` · ${DIRECTION_LABEL[row.direction]}` : ""}`,
    })),
  ];
  return (
    <Select
      value={mode === "latest" ? "latest" : (activeId ?? "latest")}
      options={options}
      onChange={(v) => onSelect(v === "latest" ? null : v)}
    />
  );
}
