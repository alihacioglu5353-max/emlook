import { NextResponse, type NextRequest } from "next/server";

/**
 * İyimser yönlendirme: oturum çerezi hiç yoksa korumalı sayfalardan giriş
 * ekranına gönderir. Asıl yetki kontrolü API'de yapılır.
 */
export function proxy(req: NextRequest) {
  const hasSession =
    req.cookies.has("em_at") || req.cookies.has("em_rt");
  if (!hasSession) {
    const url = new URL("/giris", req.url);
    url.searchParams.set("donus", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/panel/:path*", "/admin/:path*", "/ilan/:path*", "/akis", "/mesajlar/:path*", "/ara", "/kesfet", "/talepler", "/danisman/:path*", "/kaydedilenler", "/kayit"],
};
