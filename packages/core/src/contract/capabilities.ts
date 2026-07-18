import type { LicenseSnapshot } from "@kansoku/pro-api";
import type { FeatureKey, FeatureState } from "../../../pro-api/src/features.js";
import { defineRoutes } from "./defineRoutes.js";

export interface CapabilitiesOut {
  pro: boolean;
  licensed: boolean;
  license?: LicenseSnapshot;
  features: Record<FeatureKey, FeatureState>;
}

export interface CapabilitiesApi {
  get(): Promise<CapabilitiesOut>;
}

export const capabilitiesRoutes = defineRoutes<CapabilitiesApi>("capabilities", {
  get: { method: "GET", path: "/" },
});
