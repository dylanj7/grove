import { NextResponse } from "next/server";
import { createClient, getUserId } from "@/lib/supabase/server";

// Where a device says "you may reach me here", and "stop reaching me here".
//
// The row is written under the USER's own client, not the service key: the
// subscription belongs to the person, RLS is the real boundary, and a route
// that escalates privilege to write a row the caller owns is a route that only
// has to be wrong once.
export const runtime = "nodejs";

type Incoming = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  tzOffset?: unknown;
};

type Parsed = { endpoint: string; p256dh: string; auth: string; tz_offset: number | null };

function parse(body: unknown): Parsed | null {
  const b = (body ?? {}) as Incoming;
  const endpoint = typeof b.endpoint === "string" ? b.endpoint : "";
  const p256dh = typeof b.keys?.p256dh === "string" ? b.keys.p256dh : "";
  const auth = typeof b.keys?.auth === "string" ? b.keys.auth : "";
  // A push endpoint is always an https URL issued by the push service. Checking
  // it is cheap and keeps an obviously malformed row out of the send loop, where
  // it would cost a failed request per run forever.
  if (!endpoint.startsWith("https://") || !p256dh || !auth) return null;

  // Same range guard as parseTzOffset (±840 min covers every real zone). Null
  // rather than a guess when it's absent or nonsense: the sender treats an
  // unknown local time as "don't ring", which is the safe direction.
  const raw = Number(b.tzOffset);
  const tz_offset = Number.isInteger(raw) && Math.abs(raw) <= 840 ? raw : null;

  return { endpoint, p256dh, auth, tz_offset };
}

export async function POST(request: Request) {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });

  const sub = parse(await request.json().catch(() => null));
  if (!sub) return NextResponse.json({ ok: false }, { status: 400 });

  const supabase = await createClient();

  // UPSERT on the endpoint, not an insert. A browser re-issues the same
  // subscription every time it re-registers — which is most app opens once
  // notifications are on — so an insert would fail the unique constraint on the
  // normal path. Upserting also transfers an endpoint to whoever is signed in
  // now, which is correct: a shared device must not push one person's letters
  // to another person's lock screen.
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: uid,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      tz_offset: sub.tz_offset,
      user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      last_seen: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    console.error("push subscribe failed:", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Incoming | null;
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) return NextResponse.json({ ok: false }, { status: 400 });

  const supabase = await createClient();
  // Scoped to the caller by RLS anyway; the explicit eq is belt and braces and
  // makes the intent readable without knowing the policy.
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", uid)
    .eq("endpoint", endpoint);

  if (error) {
    console.error("push unsubscribe failed:", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
