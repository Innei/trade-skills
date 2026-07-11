import { friendlyCredentialError, type CredentialsMethod } from "./desktopCredentials";

export function deriveCredentialsStatusLabel(params: {
  serverConfigured: boolean;
  storeConfigured: boolean;
  storeMethod?: CredentialsMethod | null;
  lastError: string | null;
}): string {
  if (params.serverConfigured) {
    if (!params.storeConfigured) return "使用 OAuth 环境凭证（无需在此配置）";
    return params.storeMethod === "oauth" ? "已登录长桥账号" : "已配置";
  }
  return friendlyCredentialError(params.lastError) ?? "未配置";
}
