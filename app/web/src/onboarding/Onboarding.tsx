import type { CredentialsGetResult } from "../pages/settings/desktopCredentials";
import type { OnboardingStep } from "./gateStatus";
import { StepAi } from "./StepAi";
import { StepLongbridge } from "./StepLongbridge";

const STEPS: { key: OnboardingStep; label: string }[] = [
  { key: "longbridge", label: "连接数据" },
  { key: "ai", label: "配置 AI" },
];

function Progress({ step }: { step: OnboardingStep }) {
  const activeIndex = step === "longbridge" ? 0 : 1;
  return (
    <ol className="onboarding-progress">
      {STEPS.map((s, i) => {
        const cls = i < activeIndex ? " is-done" : i === activeIndex ? " is-active" : "";
        return (
          <li key={s.key} className={"onboarding-progress-step" + cls}>
            <span className="onboarding-progress-index">{i < activeIndex ? "✓" : i + 1}</span>
            <span className="onboarding-progress-label">{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function Onboarding({
  step,
  status,
  onRecheck,
  onComplete,
}: {
  step: OnboardingStep;
  status: CredentialsGetResult | null;
  onRecheck: () => void;
  onComplete: () => Promise<void>;
}) {
  return (
    <>
      <div className="onboarding-drag-bar" aria-hidden="true">
        <div className="desktop-titlebar-traffic-spacer" />
      </div>
      <div className="page onboarding-page">
        <div className="onboarding-shell">
          <Progress step={step} />
          {step === "longbridge" ? (
            <StepLongbridge status={status} onRecheck={onRecheck} />
          ) : (
            <StepAi onComplete={onComplete} />
          )}
        </div>
      </div>
    </>
  );
}
