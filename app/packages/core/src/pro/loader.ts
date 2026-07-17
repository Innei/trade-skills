import type { ProModule } from "@kansoku/pro-api";
import { registerProModule } from "./registry.js";

function proPackageSpecifier(): string {
  return "@kansoku/pro";
}

export async function loadPro(): Promise<boolean> {
  try {
    const mod = (await import(proPackageSpecifier())) as { default?: ProModule } & Partial<ProModule>;
    const proModule = mod.default ?? (mod as ProModule);
    registerProModule(proModule);
    return true;
  } catch {
    console.info("pro slot: @kansoku/pro not found, running in free mode");
    return false;
  }
}
