import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const sha = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
const randomToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}
function check(error: { message: string; code?: string } | null) {
  if (!error) return;
  const known: Record<string, number> = {
    INVALID_QR: 401,
    VISIT_CLOSED: 401,
    INVALID_SESSION: 401,
    SESSION_LIMIT: 429,
    ORDER_LIMIT: 429,
    INVALID_ITEMS: 400,
    INVALID_EXTRAS: 409,
    PRODUCT_UNAVAILABLE: 409,
    IDEMPOTENCY_CONFLICT: 409,
    PRICE_CHANGED: 409,
    MENU_UNAVAILABLE: 409,
    ORDER_TOO_LARGE: 400,
  };
  if (known[error.message])
    throw new ApiError(error.message, known[error.message]);
  console.error("Menu database operation failed", { code: error.code });
  throw new ApiError("BACKEND_UNAVAILABLE", 503);
}
async function body(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > 32768)
    throw new ApiError("REQUEST_TOO_LARGE", 413);
  const text = await req.text();
  if (new TextEncoder().encode(text).length > 32768)
    throw new ApiError("REQUEST_TOO_LARGE", 413);
  try {
    const data = JSON.parse(text);
    if (!data || Array.isArray(data) || typeof data !== "object") throw 0;
    return data;
  } catch {
    throw new ApiError("INVALID_REQUEST", 400);
  }
}
async function session(req: Request) {
  const token = req.headers.get("x-menu-session") ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) throw new ApiError("INVALID_SESSION", 401);
  const tokenHash = await sha(token);
  const { data: s, error } = await db
    .from("menu_sessions")
    .select("id,branch_id,visit_id,expires_at")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  check(error);
  if (!s) throw new ApiError("INVALID_SESSION", 401);
  const [{ data: v, error: ve }, { data: b, error: be }] = await Promise.all([
    db
      .from("menu_visits")
      .select("table_label,area_label")
      .eq("id", s.visit_id)
      .eq("branch_id", s.branch_id)
      .eq("status", "open")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle(),
    db
      .from("menu_branches")
      .select("slug")
      .eq("id", s.branch_id)
      .eq("published", true)
      .maybeSingle(),
  ]);
  check(ve);
  check(be);
  if (!v || !b) throw new ApiError("VISIT_CLOSED", 401);
  return {
    ...s,
    tokenHash,
    branchSlug: b.slug,
    tableLabel: v.table_label,
    areaLabel: v.area_label,
  };
}
async function orders(sessionId: string) {
  const { data, error } = await db
    .from("menu_order_requests")
    .select(
      "id,status,total_cents,created_at,rejection_reason,idempotency_key,menu_order_items(*)",
    )
    .eq("session_id", sessionId)
    .order("created_at");
  check(error);
  return (data ?? []).map((o) => ({
    id: o.id,
    idempotencyKey: o.idempotency_key,
    status: o.status,
    total: o.total_cents,
    createdAt: o.created_at,
    rejectionReason: o.rejection_reason,
    items: o.menu_order_items.map((i) => ({
      id: i.id,
      productId: i.product_id,
      productName: i.product_name,
      quantity: i.quantity,
      unitPrice: i.unit_price_cents,
      extras: i.extras,
      note: i.note,
    })),
  }));
}
Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const path = url.pathname.split("/").filter(Boolean).at(-1);
    if (req.method === "GET" && path === "catalog") {
      const slug = url.searchParams.get("branch") ?? "";
      if (!/^[a-z0-9-]{1,80}$/.test(slug))
        throw new ApiError("INVALID_BRANCH", 400);
      const { data: b, error } = await db
        .from("menu_branches")
        .select(
          "id,tenant_id,slug,name,location,currency,catalog_version,menu_businesses(name,tagline)",
        )
        .eq("slug", slug)
        .eq("published", true)
        .maybeSingle();
      check(error);
      if (!b) throw new ApiError("MENU_NOT_FOUND", 404);
      const [
        { data: cats, error: ce },
        { data: ps, error: pe },
        { data: es, error: ee },
      ] = await Promise.all([
        db
          .from("menu_categories")
          .select("id,name,sort_order")
          .eq("branch_id", b.id)
          .order("sort_order"),
        db
          .from("menu_products")
          .select("*")
          .eq("branch_id", b.id)
          .order("sort_order"),
        db
          .from("menu_product_extras")
          .select("product_id,id,name,price_cents")
          .eq("branch_id", b.id)
          .eq("available", true),
      ]);
      check(ce);
      check(pe);
      check(ee);
      return reply({
        branch: {
          id: b.id,
          slug: b.slug,
          name: b.name,
          location: b.location,
          currency: b.currency,
          version: b.catalog_version,
          businessName: b.menu_businesses?.name,
          tagline: b.menu_businesses?.tagline,
        },
        categories: ["Todos", ...(cats ?? []).map((c) => c.name)],
        products: (ps ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          category: cats?.find((c) => c.id === p.category_id)?.name,
          price: p.price_cents,
          image: p.image_url,
          tag: p.tag ?? undefined,
          vegetarian: p.vegetarian,
          available: p.available,
          allergens: p.allergens,
          extras: (es ?? [])
            .filter((e) => e.product_id === p.id)
            .map((e) => ({ id: e.id, name: e.name, price: e.price_cents })),
        })),
      });
    }
    if (req.method === "POST" && path === "sessions") {
      const input = await body(req);
      if (
        typeof input.qrToken !== "string" ||
        !/^[a-f0-9]{64}$/.test(input.qrToken)
      )
        throw new ApiError("INVALID_QR", 401);
      const token = randomToken();
      const { data, error } = await db.rpc("menu_open_session", {
        p_qr_hash: await sha(input.qrToken),
        p_session_hash: await sha(token),
      });
      check(error);
      return reply({ session: data, token }, 201);
    }
    if (req.method === "GET" && path === "session") {
      const s = await session(req);
      const [{ data: p, error }, savedOrders] = await Promise.all([
        db
          .from("menu_preferences")
          .select("favorites,vegetarian_only")
          .eq("session_id", s.id)
          .maybeSingle(),
        orders(s.id),
      ]);
      check(error);
      return reply({
        session: {
          id: s.id,
          branchId: s.branch_id,
          branchSlug: s.branchSlug,
          tableLabel: s.tableLabel,
          areaLabel: s.areaLabel,
          expiresAt: s.expires_at,
        },
        orders: savedOrders,
        preferences: {
          favorites: p?.favorites ?? [],
          vegetarian: p?.vegetarian_only ?? false,
        },
      });
    }
    if (req.method === "POST" && path === "orders") {
      const s = await session(req);
      const input = await body(req);
      if (
        typeof input.idempotencyKey !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          input.idempotencyKey,
        ) ||
        !Array.isArray(input.items) ||
        !Number.isSafeInteger(input.expectedTotal)
      )
        throw new ApiError("INVALID_REQUEST", 400);
      const { data: id, error } = await db.rpc("menu_submit_order", {
        p_session_hash: s.tokenHash,
        p_key: input.idempotencyKey,
        p_items: input.items,
        p_expected_total: input.expectedTotal,
      });
      check(error);
      const savedOrders = await orders(s.id);
      return reply({ order: savedOrders.find((o) => o.id === id) }, 201);
    }
    if (req.method === "PUT" && path === "preferences") {
      const s = await session(req);
      const input = await body(req);
      if (
        !Array.isArray(input.favorites) ||
        input.favorites.length > 100 ||
        input.favorites.some((id: unknown) => typeof id !== "string") ||
        typeof input.vegetarian !== "boolean"
      )
        throw new ApiError("INVALID_REQUEST", 400);
      const ids = [...new Set(input.favorites)] as string[];
      if (ids.length) {
        const { data, error } = await db
          .from("menu_products")
          .select("id")
          .eq("branch_id", s.branch_id)
          .in("id", ids);
        check(error);
        if (data?.length !== ids.length)
          throw new ApiError("INVALID_PRODUCTS", 400);
      }
      const { error } = await db
        .from("menu_preferences")
        .upsert({
          session_id: s.id,
          favorites: ids,
          vegetarian_only: input.vegetarian,
          updated_at: new Date().toISOString(),
        });
      check(error);
      return reply({ saved: true });
    }
    return reply({ error: "NOT_FOUND" }, 404);
  } catch (error) {
    if (error instanceof ApiError)
      return reply({ error: error.code }, error.status);
    console.error("Menu request failed");
    return reply({ error: "BACKEND_UNAVAILABLE" }, 503);
  }
});
