import type {
  AiUsageSummary,
  HomeEvents,
  IndustryPanorama,
  OverviewBoard,
  OverviewRecap,
  PredictionStats,
} from '@kansoku/shared/types';
import { defineRoutes } from './defineRoutes.js';

export interface OverviewApi {
  board(): Promise<OverviewBoard>;
  events(): Promise<HomeEvents>;
  industries(): Promise<IndustryPanorama>;
  recap(input: { date?: string }): Promise<OverviewRecap>;
  stats(): Promise<PredictionStats>;
  usage(input: { date?: string }): Promise<AiUsageSummary>;
  recapDates(): Promise<string[]>;
}

export const overviewRoutes = defineRoutes<OverviewApi>('overview', {
  board: { method: 'GET', path: '/' },
  events: { method: 'GET', path: '/events' },
  industries: { method: 'GET', path: '/industries' },
  recap: { method: 'GET', path: '/recap' },
  stats: { method: 'GET', path: '/stats' },
  usage: { method: 'GET', path: '/usage' },
  recapDates: { method: 'GET', path: '/recap-dates' },
});
