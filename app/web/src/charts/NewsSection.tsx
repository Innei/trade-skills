import type { NewsItem } from "../../../shared/types";

const newsTime = (iso: string) => iso.slice(5, 16).replace("T", " ");

export function NewsSection({ news }: { news: NewsItem[] }) {
  if (!news.length) return null;

  return (
    <>
      <div className="section-title">相关新闻</div>
      {news.map((n) => {
        const community = n.url.includes("/topics/");
        return (
          <a key={n.id} className="news-item" href={n.url} target="_blank" rel="noreferrer">
            <span className="news-meta">
              {newsTime(n.published_at)}
              <span className={`news-badge${community ? " community" : ""}`}>{community ? "社区" : "新闻"}</span>
            </span>
            <span className="news-title">{n.title}</span>
          </a>
        );
      })}
      <div className="note-block">社区帖为用户观点，非权威信源；引用数据前先核对原始来源</div>
    </>
  );
}
