import "server-only";
import type { MenuCatalog } from "./menu-backend";

export const defaultBranch = () =>
  process.env.MENU_BRANCH_SLUG ?? "el-olivo-roma";
export async function edgeRequest(
  path: string,
  init?: RequestInit,
  token?: string,
) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  const jwt = process.env.SUPABASE_ANON_KEY;
  if (!url || !key || !jwt)
    return Response.json({ error: "BACKEND_UNAVAILABLE" }, { status: 503 });
  try {
    return await fetch(`${url}/functions/v1/menu-api/${path}`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${jwt}`,
        ...(token ? { "X-Menu-Session": token } : {}),
      },
    });
  } catch {
    return Response.json({ error: "BACKEND_UNAVAILABLE" }, { status: 503 });
  }
}
export async function getCatalog(branch: string): Promise<MenuCatalog | null> {
  const response = await edgeRequest(
    `catalog?branch=${encodeURIComponent(branch)}`,
  );
  if (!response.ok) return null;
  return response.json();
}
