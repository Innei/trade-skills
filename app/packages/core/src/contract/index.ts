import { annotationsRoutes, type AnnotationsApi } from "./annotations.js";
import { chartsRoutes, type ChartsApi } from "./charts.js";
import { chatRoutes, type ChatApi } from "./chat.js";
import { credentialsRoutes, type CredentialsApi } from "./credentials.js";
import { healthRoutes, type HealthApi } from "./health.js";
import { overviewRoutes, type OverviewApi } from "./overview.js";
import { positionsRoutes, type PositionsApi } from "./positions.js";
import { settingsRoutes, type SettingsApi } from "./settings.js";
import { symbolsRoutes, type SymbolsApi } from "./symbols.js";

export interface AppApi {
  charts: ChartsApi;
  chat: ChatApi;
  symbols: SymbolsApi;
  annotations: AnnotationsApi;
  positions: PositionsApi;
  overview: OverviewApi;
  settings: SettingsApi;
  credentials: CredentialsApi;
  health: HealthApi;
}

export const allRoutes = {
  charts: chartsRoutes,
  chat: chatRoutes,
  symbols: symbolsRoutes,
  annotations: annotationsRoutes,
  positions: positionsRoutes,
  overview: overviewRoutes,
  settings: settingsRoutes,
  credentials: credentialsRoutes,
  health: healthRoutes,
};

export * from "./annotations.js";
export * from "./charts.js";
export * from "./chat.js";
export * from "./credentials.js";
export * from "./defineRoutes.js";
export * from "./health.js";
export * from "./overview.js";
export * from "./positions.js";
export * from "./settings.js";
export * from "./symbols.js";
