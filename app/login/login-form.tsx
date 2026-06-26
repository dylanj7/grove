"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  if (status === "sent") {
    return (
      <div className="text-center">
        <h2 className="font-voice text-2xl text-soil">Check your email</h2>
        <p className="mt-3 text-sm leading-6 text-canopy">
          A magic link is on its way to{" "}
          <span className="text-pine">{email}</span>. Open it to step in — you
          can close this tab.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label
        htmlFor="email"
        className="text-[0.7rem] font-medium uppercase tracking-[0.16em] text-canopy"
      >
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        className="rounded-xl border border-sage bg-dawn px-4 py-3 text-soil outline-none transition placeholder:text-canopy/70 focus-visible:border-moss focus-visible:ring-2 focus-visible:ring-moss/25"
      />

      {error && <p className="text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={status === "sending"}
        className="mt-1 min-h-[44px] rounded-xl bg-moss px-4 py-3 text-sm font-medium uppercase tracking-[0.12em] text-mist transition-colors hover:bg-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40 disabled:opacity-60"
      >
        {status === "sending" ? "Sending…" : "Send magic link"}
      </button>
    </form>
  );
}
