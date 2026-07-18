import type { ReactNode } from "react";
import type { FeatureKey } from "../../../packages/pro-api/src/features.js";
import { useFeature } from "./useFeature";

export function FeatureGate({
  feature,
  locked = null,
  children,
}: {
  feature: FeatureKey;
  locked?: ReactNode;
  children: ReactNode;
}) {
  const { state } = useFeature(feature);
  if (state === "absent") return null;
  if (state === "locked") return <>{locked}</>;
  return <>{children}</>;
}
