// app/api/ask/route.ts
// ----------------------------------------------------------------
// POST /api/ask — ASK GROVE.
//
// This is the feature the rest of the app was already paying for and never
// collecting on.
//
// Grove's actual moat has never been the writing. It is that a separate,
// deterministic pass (lib/patterns.ts) has already established which statements
// about this person are TRUE — sleep against their own baseline, focus streaks,
// cross-pillar chains — before any model is allowed to open its mouth. Until
// now the only way to reach that was to wait for a letter Grove chose to write,
// on Grove's schedule, about whatever Grove decided mattered.
//
// So: let people ask. "Why have I been so tired?" "Does my sleep actually
// affect my focus, or do I just think it does?" "What's changed this month?"
// The answer is assembled from the same verified patterns and the same factual
// window — never from anything else.
//
// THE ANSWER "I CAN'T SEE THAT IN YOUR DATA" IS THE POINT, NOT A FAILURE MODE.
// It is the thing no notes app and no chatbot with a wellness prompt will ever
// tell you, and it is what makes the answers that DO come back worth anything.
// The system prompt below spends most of its length defending it, because this
// is the exact surface where a model most wants to be helpful and invent.
// ----------------------------------------------------------------

import Anthropic from "@anthropic-ai/sdk";
import { cookies } from "next/headers";
import { createClient, getUserId } from "@/lib/supabase/server";
import { loadWindow } from "@/lib/window";
import { detectPatterns, windowSummary } from "@/lib/patterns";
import { localDayFromOffset, parseTzOffset, todayISO } from "@/lib/date";
import { MODELS } from "@/lib/model";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// The spend ceiling, enforced against the questions table rather than memory —
// a serverless instance forgets an in-process counter on every cold start, so
// an in-memory cap is not a cap. Set well above real use (people ask a few
// times a week) and purely to bound the pathological case.
const ASK_DAILY_LIMIT = 12;

const MAX_QUESTION = 400;

const SYSTEM = `You are Grove, answering a question someone has asked about their own life, using only their own recorded data.

WHAT YOU ARE GIVEN:
- "Verified patterns": statements that separate, deterministic code has already CONFIRMED are true in this person's data. These are facts.
- "Window summary": plain factual readings from the last fourteen days.
- Their own words from recent check-ins, where they wrote any.

THE ONE RULE THAT MATTERS MORE THAN BEING USEFUL:
You may only assert what the supplied patterns and facts support. You may not infer a trend, correlation, or cause that is not in the verified list. You may not generalise from one day to a pattern. You may not reach for what is usually true of people in general — you are answering about THIS person's record, and nothing else.

WHEN THE DATA CANNOT ANSWER THE QUESTION, SAY SO DIRECTLY AND SAY WHAT WOULD ANSWER IT.
This is a good answer, not a failed one: "Nothing in your record speaks to that yet — you've got four days of sleep data and no check-ins alongside them, so there's no way to tell whether the two move together. A week of both would show it." Never pad an empty answer with general wellness advice. Never soften "I can't see that" into a vague gesture that sounds like an answer.

PARTIAL ANSWERS ARE HONEST: answer the part the data covers, then name the part it doesn't.

VOICE: direct, grounded, specific. A sharp friend who has actually read your record — not a coach, not a therapist, not a chatbot. Short: two to five sentences. Plain prose, no headings, no bullet lists, no markdown.

NEVER: scores, grades, streaks, percentages-as-progress, praise for consistency, manufactured encouragement, exclamation marks, emoji, therapy-speak ("it sounds like you're feeling"). Recovery is a felt sense, never a number. Do not compare them to other people or to population averages.

If they ask something Grove has no business answering — medical diagnosis, medication, anything clinical — say plainly that it isn't something you can read off this data, and leave it there.

Return only the answer. Do not include internal or system XML tags in your response.`;

export async function POST(request: Request) {
  const uid = await getUserId();
  if (!uid) return new Response("Not authenticated", { status: 401 });

  let body: { question?: string };
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const question = (body.question ?? "").trim().slice(0, MAX_QUESTION);
  if (!question) return new Response("Ask something first.", { status: 400 });

  const offset = parseTzOffset((await cookies()).get("tzoff")?.value);
  const localDay = offset === null ? todayISO() : localDayFromOffset(offset);

  const supabase = await createClient();

  // The cap and the context load are independent, so they go together.
  const [countRes, win] = await Promise.all([
    supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .eq("day", localDay),
    loadWindow(supabase, uid),
  ]);

  if ((countRes.count ?? 0) >= ASK_DAILY_LIMIT) {
    return new Response(
      "That's as many questions as Grove will answer in a day. Your record will still be here tomorrow.",
      { status: 429 },
    );
  }

  const patterns = detectPatterns(win.physical, win.checkins, win.touches, win.goals);
  const summary = windowSummary(win.physical, win.checkins, win.goals, win.touches, todayISO());

  // Their own words are fair material — it is their record. Capped so a long
  // journal habit can't push the verified patterns out of the model's view.
  const notes = win.checkins
    .filter((c) => c.note_text?.trim())
    .slice(0, 8)
    .map((c) => `- ${c.day} (${c.slot}): "${c.note_text!.trim().slice(0, 300)}"`)
    .join("\n");

  const userMsg = `Their question:
"${question}"

Verified patterns (the ONLY trends, correlations or causes you may assert):
${patterns.length ? patterns.map((p) => `- [${p.strength}] ${p.statement}`).join("\n") : "(none — nothing in their data clears the bar for a verified trend yet)"}

Window summary (plain facts from the last fourteen days):
${summary}

${notes ? `Their own words recently:\n${notes}` : "They haven't written anything down recently."}

Answer honestly. If their record can't answer this, say so and say what would.`;

  try {
    // Streamed and thinking, unlike the reply: this one IS a reasoning problem.
    // The hard part is not the prose, it is deciding what this specific record
    // does and does not license — which is exactly the judgment that keeps the
    // answer honest, and exactly where a cheaper model starts being agreeable
    // instead of correct. A person who typed a question will wait a beat.
    const stream = anthropic.messages.stream({
      model: MODELS.ask,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: SYSTEM,
      messages: [{ role: "user", content: userMsg }],
    });

    const encoder = new TextEncoder();
    let answer = "";

    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              answer += event.delta.text;
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          const final = await stream.finalMessage();
          // A safety decline arrives as a normal 200 — people ask hard things
          // about their own lives, and a thrown page would be the worst
          // possible response to that.
          if (final.stop_reason === "refusal" && !answer) {
            const msg = "That's not something I can answer from your record.";
            answer = msg;
            controller.enqueue(encoder.encode(msg));
          }
        } catch (err) {
          console.error("ask stream failed:", err);
        } finally {
          controller.close();
        }

        // Written AFTER the stream so the user never waits on the insert, and
        // so the row records what was actually said rather than what was asked
        // for. Best-effort: a failed log must never break an answer already on
        // screen. Fire-and-forget on purpose — start() has already closed the
        // controller, so nothing downstream is waiting on this.
        void supabase
          .from("questions")
          .insert({ user_id: uid, day: localDay, question, answer: answer || null })
          .then(({ error }) => {
            if (error) console.error("ask log failed:", error.message);
          });
      },
      cancel() {
        // They navigated away — stop paying for tokens nobody will read.
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
    console.error("ask failed:", err);
    return new Response("Grove couldn't answer that just now.", { status: 503 });
  }
}
