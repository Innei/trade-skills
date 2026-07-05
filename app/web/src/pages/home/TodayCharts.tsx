import type { ChartMeta } from "../../../../shared/types";
import { useQuery } from "../../apiHooks";
import { Badge, Card, SectionTitle } from "../../ui";

export function TodayCharts({ date }: { date: string | null }) {
  const { data: charts } = useQuery<ChartMeta[]>("/api/charts");
  if (!date || !charts) return null;
  const today = charts.filter((m) => m.id.startsWith(date));
  if (today.length === 0) return null;

  return (
    <div className="today-charts">
      <SectionTitle>今日图表</SectionTitle>
      <div className="today-charts-row">
        {today.map((m) => (
          <Card link className="today-chart-item" key={m.id} href={`/charts/${encodeURIComponent(m.id)}`}>
            <Badge>{m.type}</Badge>
            <span className="title">{m.title}</span>
          </Card>
        ))}
      </div>
    </div>
  );
}
