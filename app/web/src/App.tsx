import { ChartDetail } from "./pages/ChartDetail";
import { ChartList } from "./pages/ChartList";
import { useHashRoute } from "./router";

export function App() {
  const route = useHashRoute();

  const chartMatch = route.match(/^\/charts\/(.+)$/);
  if (chartMatch) {
    return <ChartDetail id={decodeURIComponent(chartMatch[1])} />;
  }
  return <ChartList />;
}
