import { API_URL, forwardedHeaders } from "@/lib/server/backend";

export async function POST(req: Request) {
  const body = await req.text();
  const res = await fetch(`${API_URL}/auth/otp/request`, {
    method: "POST",
    headers: { "content-type": "application/json", ...forwardedHeaders(req) },
    body,
    cache: "no-store",
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
