import { type Static, Type } from 'typebox';

export const journalSchema = Type.Object({ content: Type.String() });

export const anchorSchema = Type.Object({
  timeframe: Type.Union([
    Type.Literal('m5'),
    Type.Literal('m15'),
    Type.Literal('h1'),
    Type.Literal('day'),
  ]),
  time: Type.String(),
  price: Type.Number(),
});

export const entryPlanSchema = Type.Object({
  entry: Type.Number(),
  stop: Type.Number(),
  target1: Type.Optional(Type.Number()),
  target2: Type.Optional(Type.Number()),
  target1_pct: Type.Optional(Type.Number()),
  target2_pct: Type.Optional(Type.Number()),
  note: Type.Optional(Type.String()),
  rationale: Type.Optional(Type.String()),
});

export const scenarioSchema = Type.Object({
  label: Type.String(),
  probability: Type.Number({
    minimum: 0,
    maximum: 100,
    description: 'A percentage from 0 to 100; the three scenario probabilities should sum to approximately 100.',
  }),
  trigger: Type.Optional(Type.String()),
  path: Type.Optional(Type.String()),
});

export const rangePlanSchema = Type.Object({
  condition: Type.Optional(Type.String()),
  long_tactic: Type.Optional(Type.String()),
  short_tactic: Type.Optional(Type.String()),
  low: Type.Optional(Type.Number({ description: 'Lower bound of the range; required for neutral.' })),
  high: Type.Optional(Type.Number({ description: 'Upper bound of the range; required for neutral.' })),
});

export const predictionSchema = Type.Object({
  direction: Type.Union([Type.Literal('long'), Type.Literal('short'), Type.Literal('neutral')]),
  anchor: anchorSchema,
  entry_plan: Type.Optional(entryPlanSchema),
  scenarios: Type.Array(scenarioSchema, { minItems: 2, maxItems: 4 }),
  range_plan: Type.Optional(rangePlanSchema),
  comment: Type.String({ description: 'A one-sentence plain-language conclusion to store as a comment.' }),
});

export type PredictionParams = Static<typeof predictionSchema>;

export const commentSchema = Type.Object({
  level: Type.Union([Type.Literal('info'), Type.Literal('warn'), Type.Literal('alert')]),
  text: Type.String({ description: 'A plain-language observation.' }),
});

export const submitSectionTechnicalSchema = Type.Object({
  kind: Type.Literal('technical'),
  trends: Type.Array(
    Type.Object({
      timeframe: Type.Union([
        Type.Literal('m5'),
        Type.Literal('m15'),
        Type.Literal('h1'),
        Type.Literal('day'),
      ]),
      trend: Type.Union([Type.Literal('up'), Type.Literal('down'), Type.Literal('sideways')]),
    }),
    { minItems: 1, maxItems: 4 },
  ),
  levels: Type.Array(
    Type.Object({
      price: Type.Number({ exclusiveMinimum: 0 }),
      label: Type.String({ minLength: 1, maxLength: 30 }),
    }),
    { minItems: 1, maxItems: 8 },
  ),
  summary: Type.String({ minLength: 1, maxLength: 200 }),
});

export const submitSectionContextSchema = Type.Object({
  kind: Type.Literal('context'),
  summary: Type.String({ minLength: 1, maxLength: 200 }),
  bias: Type.Union([Type.Literal('bullish'), Type.Literal('bearish'), Type.Literal('neutral')]),
});

export const submitSectionSchema = Type.Union([
  submitSectionTechnicalSchema,
  submitSectionContextSchema,
]);

export type SubmitSectionParams = Static<typeof submitSectionSchema>;

export function validateSubmitSection(params: SubmitSectionParams): string[] {
  const issues: string[] = [];
  if (params.kind === 'technical') {
    const seen = new Set<string>();
    for (const trend of params.trends) {
      if (seen.has(trend.timeframe)) issues.push(`trends 中周期 ${trend.timeframe} 重复`);
      seen.add(trend.timeframe);
    }
  }
  return issues;
}
