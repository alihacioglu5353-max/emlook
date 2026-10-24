import { API_URL, forwardedHeaders } from "@/lib/server/backend";
import { writeTokens } from "@/lib/server/session";

/** E-posta + parola girişi: belirteçler çereze yazılır; tarayıcıya yalnızca kullanıcı bilgisi döner. */
export async function POST(req: Request) {
  const res = await fetch(`${API_URL}/auth/password/login`, {
    method: "POST",
    headers: { "content-type": "application/json", ...forwardedHeaders(req) },
    body: await req.text(),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) return Response.json(data, { status: res.status });

  await writeTokens(data);
  return Response.json({ user: data.user, onboardingRequired: data.onboardingRequired });
}
