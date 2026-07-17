// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetCapabilitiesStoreForTests } from "./capabilitiesStore";
import { getLicenseModalStateForTests, openLicenseModal, resetLicenseModalStoreForTests } from "./licenseModalStore";

const capabilitiesGet = vi.fn();
const subscribeUrlGet = vi.fn();
const activate = vi.fn();
const deactivate = vi.fn();

vi.mock("./client", () => ({
  client: {
    capabilities: { get: (...args: unknown[]) => capabilitiesGet(...args) },
    settings: { getSubscribeUrl: (...args: unknown[]) => subscribeUrlGet(...args) },
    license: {
      activate: (...args: unknown[]) => activate(...args),
      deactivate: (...args: unknown[]) => deactivate(...args),
    },
  },
}));

const { LicenseModal } = await import("./LicenseModal");

function renderWithClient(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

describe("LicenseModal", () => {
  afterEach(() => {
    cleanup();
    resetCapabilitiesStoreForTests();
    resetLicenseModalStoreForTests();
    capabilitiesGet.mockReset();
    subscribeUrlGet.mockReset();
    activate.mockReset();
    deactivate.mockReset();
  });

  it("renders nothing when closed", () => {
    renderWithClient(<LicenseModal />);
    expect(screen.queryByText("订阅与授权")).toBeNull();
  });

  it("renders the license panel without the runtime notice when opened via guard", async () => {
    capabilitiesGet.mockResolvedValue({ pro: true, licensed: false, license: { state: "unlicensed" } });
    subscribeUrlGet.mockResolvedValue({ subscribeUrl: null });
    openLicenseModal("guard");

    renderWithClient(<LicenseModal />);

    expect(screen.getByText("订阅与授权")).toBeTruthy();
    expect(await screen.findByPlaceholderText("输入授权码")).toBeTruthy();
    expect(screen.queryByText(/本次操作因授权已失效/)).toBeNull();
  });

  it("renders the runtime-403 notice when opened by a mid-session 403", async () => {
    capabilitiesGet.mockResolvedValue({ pro: true, licensed: false, license: { state: "unlicensed" } });
    subscribeUrlGet.mockResolvedValue({ subscribeUrl: null });
    openLicenseModal("runtime-403");

    renderWithClient(<LicenseModal />);

    expect(await screen.findByText(/本次操作因授权已失效/)).toBeTruthy();
  });

  it("closes on a successful activation", async () => {
    capabilitiesGet.mockResolvedValue({ pro: true, licensed: false, license: { state: "unlicensed" } });
    subscribeUrlGet.mockResolvedValue({ subscribeUrl: null });
    activate.mockResolvedValue({ activated: true });
    openLicenseModal("guard");

    renderWithClient(<LicenseModal />);
    const input = await screen.findByPlaceholderText("输入授权码");
    fireEvent.change(input, { target: { value: "KEY-1234" } });

    capabilitiesGet.mockResolvedValue({
      pro: true,
      licensed: true,
      license: { state: "licensed", maskedKey: "••••1234" },
    });
    fireEvent.click(screen.getByText("激活"));

    await waitFor(() => expect(getLicenseModalStateForTests().open).toBe(false));
    expect(activate).toHaveBeenCalledWith({ key: "KEY-1234" });
  });
});
