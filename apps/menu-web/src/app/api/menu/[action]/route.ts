import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { defaultBranch, edgeRequest } from "@/lib/menu-server";

const COOKIE = "foodlify-menu-session";
type Context = { params: Promise<{ action: string }> };
export async function GET(req: NextRequest, { params }: Context) {
  const { action } = await params;
  if (action === "catalog")
    return edgeRequest(
      `catalog?branch=${encodeURIComponent(req.nextUrl.searchParams.get("branch") ?? defaultBranch())}`,
    );
  if (action !== "session")
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const token = (await cookies()).get(COOKIE)?.value;
  return edgeRequest("session", {}, token);
}
async function mutate(req: NextRequest, { params }: Context) {
  const { action } = await params;
  if (
    !["sessions", "orders", "preferences"].includes(action) ||
    (req.method === "PUT") !== (action === "preferences")
  )
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const origin = req.headers.get("origin");
  if (!origin || origin !== req.nextUrl.origin)
    return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  if (Number(req.headers.get("content-length") ?? 0) > 32768)
    return NextResponse.json({ error: "REQUEST_TOO_LARGE" }, { status: 413 });
  const body = await req.text();
  if (new TextEncoder().encode(body).length > 32768)
    return NextResponse.json({ error: "REQUEST_TOO_LARGE" }, { status: 413 });
  const jar = await cookies();
  const response = await edgeRequest(
    action,
    { method: req.method, body },
    jar.get(COOKIE)?.value,
  );
  if (action !== "sessions" || !response.ok) return response;
  const data = await response.json();
  const output = NextResponse.json(
    { session: data.session },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
  output.cookies.set(COOKIE, data.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(data.session.expiresAt),
  });
  return output;
}
export const POST = mutate;
export const PUT = mutate;
