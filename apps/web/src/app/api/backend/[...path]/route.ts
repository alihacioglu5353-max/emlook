import type { NextRequest } from "next/server";
import { backendFetch } from "@/lib/server/backend";

/**
 * Tarayıcıdan gelen istekleri oturum belirteciyle Emlook API'sine iletir.
 * /api/backend/agents/me/verification → {API_URL}/agents/me/verification
 */
async function handle(req: NextRequest, ctx: RouteContext<"/api/backend/[...path]">) {
  const { path } = await ctx.params;
  if (path.some((p) => p === ".." || p === "." || p.includes("\\"))) {
    return Response.json({ message: "Geçersiz yol" }, { status: 400 });
  }
  const target = `/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  const headers: Record<string, string> = {};
  const contentType = req.headers.get("content-type");
  if (contentType) headers["content-type"] = contentType;

  const hasBody = !["GET", "HEAD"].includes(req.method);
  // JSON gövdeler tamponlanır (yenileme sonrası tekrar gönderilebilsin);
  // dosya yüklemeleri akış olarak iletilir.
  const isMultipart = contentType?.startsWith("multipart/form-data") ?? false;
  const body = hasBody ? (isMultipart ? req.body : await req.text()) : undefined;

  const res = await backendFetch(
    target,
    {
      method: req.method,
      headers,
      body,
      ...(isMultipart ? { duplex: "half" as const } : {}),
    },
    req,
  );

  const out = new Headers();
  for (const h of ["content-type", "content-length", "content-disposition"]) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set("cache-control", "no-store");
  return new Response(res.body, { status: res.status, headers: out });
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
