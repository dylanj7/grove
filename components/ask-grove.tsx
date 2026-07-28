"use client";

import { useRef, useState } from "react";
import { ArrowUp, RotateCcw } from "lucide-react";
import { Card, SectionLabel, Voice } from "@/components/ui";

// ============================================================================
// ASK GROVE — the front end of the honesty layer.
// ----------------------------------------------------------------------------
// See app/api/ask/route.ts for what makes this different from a chat box: the
// answer may only draw on patterns that separate deterministic code already
// verified in this person's data, and "your record can't answer that yet" is a
// first-class answer rather than a failure.
//
// The suggestions are not filler. On first sight this control is a blank box
// with no obvious grammar, and the questions people don't think to ask are
// exactly the cross-pillar ones the app exists to answer — so the chips teach
// the feature by demonstrating its range in one glance.
// ============================================================================

const SUGGESTIONS = [
  "Why have I been so tired?",
  "Does my sleep actually affect my focus?",
  "What's changed in the last two weeks?",
  "What am I avoiding?",
];

type Status = "idle" | "streaming" | "done" | "error";

export default function AskGrove() {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  // So a second question cancels the first mid-flight rather than interleaving
  // two streams into the same box — and stops paying for the abandoned one.
  const abortRef = useRef<AbortController | null>(null);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || status === "streaming") return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAsked(text);
    setQuestion("");
    setAnswer("");
    setStatus("streaming");

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        // The 429 body is a real sentence meant to be read, so it is shown as
        // written rather than replaced with a generic failure.
        setAnswer(await res.text().catch(() => "") || "Grove couldn't answer that just now.");
        setStatus("error");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setAnswer((prev) => prev + decoder.decode(value, { stream: true }));
      }
      setStatus("done");
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return; // superseded, not failed
      setAnswer("Grove couldn't reach your record just now.");
      setStatus("error");
    }
  }

  const busy = status === "streaming";

  return (
    <section className="space-y-3">
      <SectionLabel right="only from your data">Ask Grove</SectionLabel>

      <Card className="space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
          className="flex items-center gap-2"
        >
          <input
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Why have I been so tired?"
            maxLength={400}
            aria-label="Ask a question about your record"
            className="min-h-[44px] flex-1 bg-transparent text-[1rem] text-soil placeholder:text-canopy/55 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!question.trim() || busy}
            aria-label="Ask"
            className="grove-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-moss text-mist transition-opacity disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40"
          >
            <ArrowUp size={18} aria-hidden />
          </button>
        </form>

        {status === "idle" && (
          <div className="flex flex-wrap gap-2 border-t border-sage/60 pt-4">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void ask(s)}
                className="grove-press rounded-full border border-sage bg-mist px-3 py-1.5 text-left text-[0.78rem] text-canopy hover:border-moss/50 hover:text-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {asked && (
          <div className="space-y-3 border-t border-sage/60 pt-4">
            <p className="text-[0.82rem] leading-snug text-canopy">{asked}</p>

            {answer ? (
              <Voice className="grove-fade text-[1.02rem] leading-[1.6] text-soil">
                {answer}
                {busy && (
                  <span
                    aria-hidden
                    className="grove-pulse ml-0.5 inline-block h-[0.95em] w-[2px] translate-y-[0.12em] bg-moss"
                  />
                )}
              </Voice>
            ) : busy ? (
              // Named, not spun. "Reading your record" is what is actually
              // happening, and it is the reassurance that matters here: the
              // answer is coming from their data, not from a language model's
              // general opinion about tiredness.
              <p className="grove-skeleton text-[0.9rem] text-canopy">
                Reading your record…
              </p>
            ) : null}

            {!busy && (
              <button
                type="button"
                onClick={() => {
                  setAsked("");
                  setAnswer("");
                  setStatus("idle");
                  inputRef.current?.focus();
                }}
                className="grove-press inline-flex items-center gap-1.5 text-[0.7rem] uppercase tracking-[0.12em] text-canopy hover:text-moss focus-visible:outline-none focus-visible:underline"
              >
                <RotateCcw size={12} aria-hidden />
                Ask something else
              </button>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}
