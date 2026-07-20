import type {
  DeepDiveStartResult,
  DeepDiveState,
  ProAiExtension,
  ProAiTurnContext,
  ProHooks,
} from '@kansoku/pro-api';
import { prepareProAiTurn, type PreparedProAiTurn } from '../aiExtension.js';
import { LegacyAiTurnPipeline } from './legacyAdapters.js';
import type { AiTurnPipeline } from './aiTurnPipeline.js';
import type { DeepDiveService } from './deepDiveService.js';
import type { FollowAutomation } from './followAutomation.js';

export class DisabledFollowAutomation implements FollowAutomation {
  requestImmediateFollow(_symbol: string): void {}
}

export class DisabledDeepDiveService implements DeepDiveService {
  startDeepDiveForNote(_note: string): DeepDiveStartResult {
    return { started: false, reason: 'disabled' };
  }

  deepDiveStatus(): DeepDiveState {
    return { running: false };
  }
}

export class EmptyAiTurnPipeline implements AiTurnPipeline {
  async prepareTurn(_context: ProAiTurnContext): Promise<PreparedProAiTurn> {
    return { readMounts: [], processors: [] };
  }
}

export class EditionFollowAutomation implements FollowAutomation {
  constructor(private readonly hooks: Pick<ProHooks, 'requestImmediateFollow'>) {}

  requestImmediateFollow(symbol: string): Promise<void> | void {
    return this.hooks.requestImmediateFollow(symbol);
  }
}

export class EditionDeepDiveService implements DeepDiveService {
  constructor(private readonly hooks: Pick<ProHooks, 'startDeepDiveForNote' | 'deepDiveStatus'>) {}

  startDeepDiveForNote(note: string): DeepDiveStartResult {
    return this.hooks.startDeepDiveForNote(note);
  }

  deepDiveStatus(): DeepDiveState {
    return this.hooks.deepDiveStatus();
  }
}

export class EditionAiTurnPipeline implements AiTurnPipeline {
  constructor(private readonly extension: ProAiExtension | undefined) {}

  prepareTurn(context: ProAiTurnContext): Promise<PreparedProAiTurn> {
    return prepareProAiTurn(context, this.extension);
  }
}

let defaultAiTurnPipelineFactory: () => AiTurnPipeline = () => new LegacyAiTurnPipeline();

export function configureDefaultAiTurnPipeline(factory: () => AiTurnPipeline): void {
  defaultAiTurnPipelineFactory = factory;
}

export function resetDefaultAiTurnPipelineForTests(): void {
  defaultAiTurnPipelineFactory = () => new LegacyAiTurnPipeline();
}

export function defaultAiTurnPipeline(): AiTurnPipeline {
  return defaultAiTurnPipelineFactory();
}
