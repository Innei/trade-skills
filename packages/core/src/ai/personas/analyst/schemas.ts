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
