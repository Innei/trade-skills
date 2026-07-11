import { useState } from "react";
import { errorMessage } from "../../api";
import { Button } from "../../ui";
import type { DesktopCredentialsBridge } from "./desktopCredentials";

export function OAuthLoginSection({
  bridge,
  label = "用长桥账号登录",
  onDone,
}: {
  bridge: DesktopCredentialsBridge;
  label?: string;
  onDone: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loginOAuth = bridge.loginOAuth;

  if (!loginOAuth) return null;

  const handleLogin = async () => {
    setRunning(true);
    setError(null);
    try {
      const result = await loginOAuth();
      if (result.ok) onDone();
      else setError(result.error);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="oauth-login-section">
      <Button accent state={running ? "busy" : undefined} disabled={running} onClick={handleLogin}>
        {label}
      </Button>
      <div className="settings-footer-note">会打开浏览器完成长桥账号授权，无需手动填写 API 凭证。</div>
      {error && <div className="settings-test-result settings-test-result--fail">{error}</div>}
    </div>
  );
}
