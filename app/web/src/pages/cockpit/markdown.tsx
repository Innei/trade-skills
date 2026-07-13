import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { openModal } from "../../ui";

type MarkdownVariant = "chat" | "report";

export const MARKDOWN_COMPONENTS: Components = {
  table: ({ children }) => (
    <div className="typeset-scroll">
      <table>{children}</table>
    </div>
  ),
};

export function Markdown({
  children,
  variant = "report",
}: {
  children: string;
  variant?: MarkdownVariant;
}) {
  return (
    <div className={`typeset typeset-${variant}`}>
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
