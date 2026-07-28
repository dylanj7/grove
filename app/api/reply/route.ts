// app/api/reply/route.ts
// ----------------------------------------------------------------
// POST /api/reply — THE ANSWER BACK.
//
// This is the piece that changes what Grove *is* to use. Before, you filled in
// seven fields and got a confirmation screen; the app's only real voice arrived
// on a separate screen, on its own schedule. Nothing you did was ever answered.
// A notes app at least hands you your own thoughts back instantly — Grove gave
// you less than that.
//
// So: the moment a capture lands, Grove says one true thing about it, streamed
// token by token so the first words appear in well under a second. It is short
// on purpose (two sentences, no moves, no advice) — the letter is still the
// letter. This is just the app being present when you show up.
//
// The honesty discipline is exactly the brief's: the model may speak to the
// user's own words and to patterns that lib/patterns.ts already VERIFIED true in
// the data. It may not invent a trend, and it may not congratulate.
// ----------------------------------------------------------------

import Anthropic from "@anthropic-ai/sdk";
import { createClient, getUserId } from "@/lib/supabase/server";
import { loadWindow } from "@/lib/window";
import { detectPatterns } from "@/lib/patterns";
import { isSlot } from "@/lib/slot";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const SYSTEM = `You are Grove, speaking to someone the instant they've set down how they're doing. They are still looking at the screen. Say ONE true thing back.

WHAT THIS IS: not a brief, not advice, not a plan. It's the app being present — the equivalent of a friend who actually heard you. Two sentences maximum, often one is better.

VOICE: direct, grounded, warm without being soft. A sharp friend, not a wellness app. You may be quiet and plain. If what they said is hard, meet it honestly rather than reframing it upward.

HARD RULES — these protect their trust:
- You may reference ONLY: what they just wrote, and the verified patterns supplied to you. Each verified pattern was confirmed true in their data by separate code. Never invent a trend, streak, correlation, or cause.
- Never praise a number, a streak, or consistency. No scores, no grades, no "great job".
- Never manufacture encouragement. If the read is genuinely good, you may say so plainly. If it's a hard day, say that and leave it standing — don't rush to fix it.
- No advice unless they asked something. No questions back unless one is genuinely the only honest response.
- No therapy-speak ("it sounds like you're feeling"), no exclamation marks, no emoji.
- If they wrote nothing and only moved the dials, speak to the state itself, briefly.

Return ONLY the sentences. No preamble, no quotes, no markdown. Do not include internal or system XML tags in your response.`;

export async function POST(request: Request) {
  const uid = await getUserId();
  if (!uid) {
    return new Response("Not authenticated", { status: 401 });
  }

  let body: { slot?: string; note?: string; mood?: number; energy?: number; focus?: number };
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const slot = isSlot(body.slot ?? "") ? body.slot! : "morning";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";

  // The window is the same read the brief uses, so the reply can only speak to
  // facts the rest of the app already stands behind. Best-effort: if it fails,
  // the model still gets their words, which is the part that matters most here.
  let patternLines = "(none yet — too little data for any trend to be verified)";
  try {
    const supabase = await createClient();
    const win = await loadWindow(supabase, uid);
    const patterns = detectPatterns(win.physical, win.checkins, win.touches, win.goals);
    if (patterns.length) {
      patternLines = patterns.map((p) => `- [${p.strength}] ${p.statement}`).join("\n");
    }
  } catch (err) {
    console.error("reply: window read failed", err);
  }

  const felt: string[] = [];
  const MOOD = ["", "heavy", "low", "even", "light", "bright"];
  const ENERGY = ["", "drained", "low", "steady", "full", "brimming"];
  const FOCUS = ["", "scattered", "foggy", "okay", "clear", "sharp"];
  if (body.mood) felt.push(`mood ${MOOD[body.mood] ?? "even"}`);
  if (body.energy) felt.push(`energy ${ENERGY[body.energy] ?? "steady"}`);
  if (body.focus) felt.push(`focus ${FOCUS[body.focus] ?? "okay"}`);

  const userMsg = `This is their ${slot} capture, just now.

${felt.length ? `They marked: ${felt.join(", ")}.` : "They didn't mark how they feel."}

${note ? `In their own words:\n"${note}"` : "They wrote nothing."}

Verified patterns (the ONLY trends you may reference):
${patternLines}

Say one true thing back.`;

  try {
    // Streamed, because the point of this endpoint is presence and a blank
    // pause is absence.
    //
    // Thinking is DISABLED here, which is the one place in Grove it is. On this
    // model thinking runs to completion before the first text token, so on
    // adaptive it measured ~4.2s of silence before a word appeared, against
    // ~2.6s with it off — and the replies were no better for it (this is a
    // short honest sentence, not a reasoning problem; the reasoning already
    // happened in patterns.ts, deterministically). The documented risk of
    // disabling it is internal tags leaking into visible text; that matters
    // more here than anywhere else, since this text IS the product, so the
    // system prompt carries the generic no-XML guard and this was checked
    // across repeated runs. The letter, where depth genuinely pays, keeps
    // adaptive thinking on.
    const stream = anthropic.messages.stream({
      model: "claude-opus-5",
      max_tokens: 512,
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: userMsg }],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
        } catch (err) {
          console.error("reply stream failed:", err);
          // Mid-stream failure: close cleanly rather than erroring the response.
          // The sheet shows whatever arrived; a partial true sentence beats a
          // red error on the one screen meant to feel like being heard.
        } finally {
          controller.close();
        }
      },
      cancel() {
        // The user closed the sheet — stop paying for tokens nobody will read.
        stream.abort();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    console.error("reply failed:", err);
    return new Response("", { status: 204 });
  }
}
