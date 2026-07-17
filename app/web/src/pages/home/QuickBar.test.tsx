// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let capabilities: { pro: boolean | null; licensed: boolean } = { pro: null, licensed: false };
const navigate = vi.fn();

vi.mock("../../capabilitiesStore", () => ({
  useCapabilities: () => capabilities,
}));
vi.mock("../../router", () => ({
  navigate: (...args: unknown[]) => navigate(...args),
}));

const { QuickBar } = await import("./QuickBar");

afterEach(() => {
  cleanup();
  capabilities = { pro: null, licensed: false };
  navigate.mockReset();
});

describe("QuickBar AI entry visibility", () => {
  it("hides the research/chat icons for a community build (pro:false)", () => {
    capabilities = { pro: false, licensed: false };
    render(<QuickBar shortcuts={[]} />);

    expect(screen.queryByLabelText("研究库")).toBeNull();
    expect(screen.queryByLabelText("AI 对话")).toBeNull();
  });

  it("renders clickable anchors for research/chat when pro but unlicensed", () => {
    capabilities = { pro: true, licensed: false };
    render(<QuickBar shortcuts={[]} />);

    const research = screen.getByLabelText("研究库");
    const chat = screen.getByLabelText("AI 对话");

    expect(research.tagName).toBe("A");
    expect(research.getAttribute("href")).toBe("/research?view=journal");
    expect(chat.tagName).toBe("A");
    expect(chat.getAttribute("href")).toBe("/chat");
  });

  it("renders clickable anchors for research/chat when pro and licensed", () => {
    capabilities = { pro: true, licensed: true };
    render(<QuickBar shortcuts={[]} />);

    const research = screen.getByLabelText("研究库");
    const chat = screen.getByLabelText("AI 对话");

    expect(research.tagName).toBe("A");
    expect(research.getAttribute("href")).toBe("/research?view=journal");
    expect(chat.tagName).toBe("A");
    expect(chat.getAttribute("href")).toBe("/chat");
  });
});
