import { type Static, Type } from "typebox";
import { barSchema } from "./bar.js";
import { newsItemSchema } from "./newsItem.js";

const ISO_DATETIME_PATTERN =
  "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$";

const jsonRecordSchema = Type.Record(Type.String(), Type.Unknown());

const fixturesSchema = Type.Object(
  {
    kline: Type.Record(Type.String(), Type.Array(barSchema)),
    indicators: jsonRecordSchema,
    quote: jsonRecordSchema,
    capitalFlow: jsonRecordSchema,
    news: Type.Array(newsItemSchema),
    fundamentals: jsonRecordSchema,
    calendar: jsonRecordSchema,
  },
  { additionalProperties: false },
);

const replaySchema = Type.Object(
  {
    horizonBars: Type.Integer({ minimum: 1 }),
    bars: Type.Array(barSchema),
  },
  { additionalProperties: false },
);

export const questionSchema = Type.Object(
  {
    id: Type.String(),
    bank: Type.Union([Type.Literal("swing"), Type.Literal("intraday")]),
    symbol: Type.String(),
    cutoff: Type.String({ pattern: ISO_DATETIME_PATTERN }),
    layer: Type.String(),
    adversarial: Type.Boolean(),
    fixtures: fixturesSchema,
    replay: replaySchema,
  },
  { additionalProperties: false },
);

export type Question = Static<typeof questionSchema>;

export type RunnerQuestion = Omit<Question, "replay">;
