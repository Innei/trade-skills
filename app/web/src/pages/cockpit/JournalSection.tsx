import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useQuery } from "../../apiHooks";
import { ErrorBox, SectionTitle, Spinner } from "../../ui";

export interface JournalEntryMeta {
  name: string;
  date: string;
}

export function JournalSection({
  symbol,
  entries,
  selected,
  onSelect,
  markdownComponents,
}: {
  symbol: string;
  entries: JournalEntryMeta[];
  selected: string | null;
  onSelect: (name: string | null) => void;
  markdownComponents: Components;
}) {
  const url = selected
    ? `/api/symbols/${encodeURIComponent(symbol)}/journal/${encodeURIComponent(selected)}`
    : null;
  const { data, error, loading } = useQuery<{ name: string; markdown: string }>(url);

  return (
    <div className="journal-section">
      <SectionTitle>分析日志</SectionTitle>
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
          <div className="note-md">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {data.markdown}
            </ReactMarkdown>
          </div>
        ) : null)}
    </div>
  );
}
