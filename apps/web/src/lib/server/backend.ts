import "server-only";
import { clearTokens, readTokens, writeTokens, type TokenPair } from "./session";

export const API_URL = (process.env.API_URL ?? "http://localhost:3000/api/v1").replace(
  /\/$/,
  "",
);

/** İstemcinin IP ve tarayıcı bilgisini API'ye iletir (rıza ve oturum kayıtları için). */
export function forwardedHeaders(req: Request): Record<string, string> {
  const h: Record<string, string> = {};
  const ua = req.headers.get("user-agent");
  if (ua) h["user-agent"] = ua;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) h["x-forwarded-for"] = fwd;
  return h;
}

let refreshing: Promise<TokenPair | null> | null = null;

/** Yenileme belirteciyle yeni çift alır; aynı anda gelen istekler tek yenileme paylaşır. */
async function refresh(refreshToken: string, req: Request): Promise<TokenPair | null> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json", ...forwardedHeaders(req) },
        body: JSON.stringify({ refreshToken }),
        cache: "no-store",
      });
      if (!res.ok) return null;
      return (await res.json()) as TokenPair;
    } catch {
      return null;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/**
 * Oturumdaki belirteçle API'yi çağırır. Erişim belirtecinin süresi dolmuşsa
 * bir kez yeniler ve isteği tekrarlar; yenilenemezse çerezleri temizler.
 */
export async function backendFetch(
  path: string,
  init: RequestInit & { duplex?: "half" },
  req: Request,
): Promise<Response> {
  const tokens = await readTokens();

  const call = (accessToken: string | null) => {
    const headers = new Headers(init.headers);
    for (const [k, v] of Object.entries(forwardedHeaders(req))) headers.set(k, v);
    if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
    return fetch(`${API_URL}${path}`, { ...init, headers, cache: "no-store" });
  };

  let accessToken = tokens.accessToken;
  if (!accessToken && tokens.refreshToken) {
    const next = await refresh(tokens.refreshToken, req);
    if (next) {
      await writeTokens(next);
      accessToken = next.accessToken;
    }
  }

  const res = await call(accessToken);
  // Gövdesi akış olan istekler (dosya yükleme) tekrar gönderilemez.
  const replayable = !(init.body instanceof ReadableStream);
  if (res.status === 401 && tokens.refreshToken && replayable) {
    const next = await refresh(tokens.refreshToken, req);
    if (next) {
      await writeTokens(next);
      return call(next.accessToken);
    }
    await clearTokens();
  }
  return res;
}
