import { useState } from "react";
import { Button, Card } from "../ui";
import { CredentialsForm } from "../pages/settings/CredentialsForm";
import { OAuthLoginSection } from "../pages/settings/OAuthLoginSection";
import type { DesktopCredentialsBridge } from "../pages/settings/desktopCredentials";

const LONGBRIDGE_PORTAL_URL = "https://open.longbridgeapp.com/";

export function Onboarding({
  bridge,
  onDone,
  onSkip,
}: {
  bridge: DesktopCredentialsBridge;
  onDone: () => void;
  onSkip: () => void;
}) {
  const [showManualForm, setShowManualForm] = useState(false);
  const hasOAuth = typeof bridge.loginOAuth === "function";

  return (
    <div className="page onboarding-page">
      <Card className="onboarding-card">
        <h1>欢迎使用</h1>
        <p className="onboarding-explainer">
          行情数据来自长桥（Longbridge），用长桥账号登录即可开始使用。授权在浏览器中完成，凭证只会加密保存在本机，
          不会上传到任何第三方服务器。
        </p>

        <OAuthLoginSection bridge={bridge} label="用长桥账号登录并进入" onDone={onDone} />

        {hasOAuth && (
          <button type="button" className="settings-manual-cred-toggle" onClick={() => setShowManualForm((v) => !v)}>
            {showManualForm ? "收起手动配置" : "手动填写 API 凭证（高级）"}
          </button>
        )}
        {(showManualForm || !hasOAuth) && (
          <>
            <p className="onboarding-explainer">
              也可以到{" "}
              <a href={LONGBRIDGE_PORTAL_URL} target="_blank" rel="noreferrer">
                长桥开放平台
              </a>{" "}
              申请一组 App Key / App Secret / Access Token 手动配置。
            </p>
            <CredentialsForm
              bridge={bridge}
              submitLabel="保存并进入"
              onSaved={onDone}
              hint="填入三项凭证后先测试连接，确认无误后再保存。"
            />
          </>
        )}

        <div className="onboarding-skip-row">
          <Button onClick={onSkip}>跳过，稍后再配置</Button>
        </div>
      </Card>
    </div>
  );
}
