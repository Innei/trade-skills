import { afterEach, describe, expect, it } from "vitest";
import {
  closeLicenseModal,
  getLicenseModalStateForTests,
  openLicenseModal,
  resetLicenseModalStoreForTests,
  subscribeForTests,
} from "./licenseModalStore";

describe("licenseModalStore", () => {
  afterEach(() => {
    resetLicenseModalStoreForTests();
  });

  it("starts closed with no trigger", () => {
    expect(getLicenseModalStateForTests()).toEqual({ open: false, trigger: null });
  });

  it("openLicenseModal opens with the given trigger and notifies subscribers", () => {
    let notified = 0;
    const unsubscribe = subscribeForTests(() => notified++);

    openLicenseModal("guard");

    expect(getLicenseModalStateForTests()).toEqual({ open: true, trigger: "guard" });
    expect(notified).toBe(1);
    unsubscribe();
  });

  it("openLicenseModal can switch the trigger on an already-open modal", () => {
    openLicenseModal("guard");
    openLicenseModal("runtime-403");

    expect(getLicenseModalStateForTests()).toEqual({ open: true, trigger: "runtime-403" });
  });

  it("closeLicenseModal closes and clears the trigger, no-ops when already closed", () => {
    openLicenseModal("guard");
    closeLicenseModal();
    expect(getLicenseModalStateForTests()).toEqual({ open: false, trigger: null });

    let notified = 0;
    const unsubscribe = subscribeForTests(() => notified++);
    closeLicenseModal();
    expect(notified).toBe(0);
    unsubscribe();
  });
});
