import { boundedJson } from "./drive.ts";
declare const __OAUTH_BROKER__: string;
export const oauthBroker =
  typeof __OAUTH_BROKER__ === "undefined" ? "" : __OAUTH_BROKER__;
export interface GoogleCredentials {
  access: string;
  expires: number;
  refresh: string;
}
export interface PendingOAuth {
  verifier: string;
  state: string;
  redirect: string;
  expires: number;
}
const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
function brokerUrl(route: string): string {
  if (!oauthBroker) throw Error("GOOGLE_SETUP_REQUIRED");
  const base = new URL(oauthBroker);
  if (
    base.protocol !== "https:" ||
    base.pathname !== "/" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw Error("Invalid OAuth broker configuration");
  return base.origin + route;
}
async function post(
  route: string,
  data: unknown,
): Promise<Record<string, unknown>> {
  return (await boundedJson(
    await fetch(brokerUrl(route), {
      method: "POST",
      credentials: "omit",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(12000),
    }),
    65536,
  )) as Record<string, unknown>;
}
function credentials(
  data: Record<string, unknown>,
  refresh = "",
): GoogleCredentials {
  if (
    typeof data.access_token !== "string" ||
    data.access_token.length > 4096 ||
    !data.access_token ||
    typeof data.expires_in !== "number" ||
    data.expires_in < 30 ||
    data.expires_in > 3600 ||
    (data.refresh_token !== undefined &&
      (typeof data.refresh_token !== "string" ||
        data.refresh_token.length > 4096))
  )
    throw Error("Invalid OAuth token response");
  return {
    access: data.access_token,
    expires: Date.now() + data.expires_in * 1000,
    refresh:
      typeof data.refresh_token === "string" ? data.refresh_token : refresh,
  };
}
export async function prepareOAuth(
  redirect: string,
): Promise<{ url: string; pending: PendingOAuth }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32))),
    nonce = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ),
  );
  const data = await post("/start", { redirect, challenge, nonce });
  if (
    typeof data.url !== "string" ||
    typeof data.state !== "string" ||
    data.state.length > 4096
  )
    throw Error("Invalid OAuth start response");
  const url = new URL(data.url);
  if (
    url.origin !== "https://accounts.google.com" ||
    url.pathname !== "/o/oauth2/v2/auth" ||
    url.searchParams.get("state") !== data.state ||
    url.searchParams.get("code_challenge") !== challenge ||
    url.searchParams.get("code_challenge_method") !== "S256" ||
    url.searchParams.get("response_type") !== "code" ||
    url.searchParams.get("scope") !==
      "https://www.googleapis.com/auth/drive.appdata" ||
    url.searchParams.get("redirect_uri") !==
      new URL("/callback", oauthBroker).href
  )
    throw Error("Invalid OAuth authorization URL");
  return {
    url: url.href,
    pending: {
      verifier,
      state: data.state,
      redirect,
      expires: Date.now() + 600000,
    },
  };
}
export async function completeOAuth(
  returned: string,
  pending: PendingOAuth,
): Promise<GoogleCredentials> {
  if (pending.expires < Date.now()) throw Error("OAuth request expired");
  const url = new URL(returned),
    expected = new URL(pending.redirect);
  if (
    url.origin !== expected.origin ||
    url.pathname !== expected.pathname ||
    url.username ||
    url.password
  )
    throw Error("OAuth redirect mismatch");
  const query = new URLSearchParams(url.hash.slice(1));
  if (
    query.get("state") !== pending.state ||
    !query.get("code") ||
    query.has("error")
  )
    throw Error("OAuth authorization was not completed");
  return credentials(
    await post("/token", {
      code: query.get("code"),
      state: pending.state,
      verifier: pending.verifier,
    }),
  );
}
export async function refreshGoogle(
  value: GoogleCredentials,
): Promise<GoogleCredentials> {
  if (value.expires > Date.now() + 60000) return value;
  if (!value.refresh) throw Error("GOOGLE_AUTH_REQUIRED");
  return credentials(
    await post("/refresh", { refresh_token: value.refresh }),
    value.refresh,
  );
}
