import { Config, OAuth } from "longbridge";
import { getAuthUrlOpener } from "../credentials/authUrlOpener.js";
import { NoCredentialsError } from "../credentials/errors.js";
import { getCredentialProvider } from "../credentials/registry.js";

export async function resolveLongbridgeConfig(): Promise<Config> {
  const auth = await getCredentialProvider().getLongbridgeAuth();
  if (!auth) throw new NoCredentialsError();
  if (auth.kind === "oauth") {
    const oauth = await OAuth.build(auth.clientId, (err, url) => {
      if (err) {
        console.warn("[longbridge-stream] OAuth error", err.message);
        return;
      }
      getAuthUrlOpener()(url);
    });
    return Config.fromOAuth(oauth);
  }
  return Config.fromApikey(auth.appKey, auth.appSecret, auth.accessToken);
}
