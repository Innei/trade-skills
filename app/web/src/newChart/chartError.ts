import { ApiError, errorMessage } from "../api";

const CREDENTIAL_CODES = new Set(["NO_CREDENTIALS", "CREDENTIALS_REJECTED"]);

export interface ChartCreateError {
  kind: "credentials" | "generic";
  message: string;
}

export function classifyChartError(err: unknown): ChartCreateError {
  if (err instanceof ApiError && err.status === 503 && err.code && CREDENTIAL_CODES.has(err.code)) {
    return {
      kind: "credentials",
      message: "尚未配置或凭证已失效，请前往设置页检查 Longbridge 凭证后重试。",
    };
  }
  return { kind: "generic", message: errorMessage(err) };
}
