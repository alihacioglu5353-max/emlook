import "server-only";
import { cookies } from "next/headers";

/**
 * Belirteçler tarayıcıda JavaScript'in erişemediği httpOnly çerezlerde
 * tutulur. İstemci yalnızca /api/* köprüsünü çağırır.
 */
export const ACCESS_COOKIE = "em_at";
export const REFRESH_COOKIE = "em_rt";

const secure = process.env.NODE_ENV === "production";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
}

export async function readTokens() {
  const jar = await cookies();
  return {
    accessToken: jar.get(ACCESS_COOKIE)?.value ?? null,
    refreshToken: jar.get(REFRESH_COOKIE)?.value ?? null,
  };
}

export async function writeTokens(tokens: TokenPair) {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: tokens.accessTokenExpiresIn,
  });
  jar.set(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearTokens() {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}
