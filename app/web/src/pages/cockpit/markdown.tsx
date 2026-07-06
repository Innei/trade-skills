import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { openModal } from "../../ui";

export const MARKDOWN_COMPONENTS: Components = {
  table: ({ children }) => (
    <div className="note-md-table-wrap">
      <table>{children}</table>
    </div>
  ),
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="note-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export function openMarkdownModal({
  title,
  markdown,
  onClose,
}: {
  title: string;
  markdown: string;
  onClose?: () => void;
}): () => void {
  return openModal({
    title,
    body: <Markdown>{markdown}</Markdown>,
    onClose,
  });
}
