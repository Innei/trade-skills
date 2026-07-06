import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { useQuery } from "../../apiHooks";
import { ErrorBox, Spinner } from "../../ui";
import { Markdown, MarkdownModal } from "./markdown";

export interface JournalEntryMeta {
  name: string;
  date: string;
}

export function JournalSection({
  symbol,
  entries,
  selected,
  onSelect,
}: {
  symbol: string;
  entries: JournalEntryMeta[];
  selected: string | null;
  onSelect: (name: string | null) => void;
}) {
  const [reading, setReading] = useState(false);
  const url = selected
    ? `/api/symbols/${encodeURIComponent(symbol)}/journal/${encodeURIComponent(selected)}`
    : null;
  const { data, error, loading } = useQuery<{ name: string; markdown: string }>(url);

  return (
    <div className="journal-section">
      {entries.length === 0 ? (
        <p className="note-block">还没有分析日志——跑一次 intraday-signal 会写入 journal/</p>
      ) : (
        <div className="journal-list">
          {entries.map((e) => (
            <button
              key={e.name}
              className={`journal-entry${selected === e.name ? " active" : ""}`}
              onClick={() => onSelect(selected === e.name ? null : e.name)}
            >
              <span>{e.date}</span>
              <span className="journal-entry-name">{e.name}</span>
            </button>
          ))}
        </div>
      )}
      {selected &&
        (error ? (
          <ErrorBox>{error}</ErrorBox>
        ) : loading ? (
          <Spinner />
        ) : data?.markdown ? (
          <>
            <button className="link-button" onClick={() => setReading(true)}>
              <Maximize2 className="icon" size={13} /> 全屏阅读
            </button>
            <Markdown>{data.markdown}</Markdown>
            {reading && <MarkdownModal title={selected} markdown={data.markdown} onClose={() => setReading(false)} />}
          </>
        ) : null)}
    </div>
  );
}
