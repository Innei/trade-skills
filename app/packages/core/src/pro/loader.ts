import type { ProModule } from "@kansoku/pro-api";
import { registerProModule } from "./registry.js";

function proPackageSpecifier(): string {
  // Relative filesystem path to the gitignored slot rather than a bare package
  // specifier: nothing declares @kansoku/pro as a dependency (public code must
  // not), so pnpm never links it into node_modules and a bare import would not
  // resolve. Built from a variable so bundlers cannot statically resolve it;
  // when app/pro is absent the import throws and we fall back to free mode.
  return ["..", "..", "..", "..", "pro", "src", "index.js"].join("/");
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
