import { backendFetch } from "@/lib/server/backend";
import { clearTokens } from "@/lib/server/session";

export async function POST(req: Request) {
  try {
    await backendFetch("/auth/logout", { method: "POST" }, req);
  } finally {
    await clearTokens();
  }
  return new Response(null, { status: 204 });
}
