import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";

// Protected home screen. The proxy guards this route, but we verify the user
// server-side as a second line of defense.
export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // The profiles row is created server-side by a Postgres trigger on signup.
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = profile?.display_name?.trim();
  const greeting = displayName ? `Hello, ${displayName}.` : "Hello.";

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-green-950">
          Grove
        </h1>
        <p className="mt-3 text-lg text-green-900">{greeting}</p>
        <p className="mt-1 text-sm text-green-800/70">
          Your grove is just getting started.
        </p>

        <form action={signOut} className="mt-10">
          <button
            type="submit"
            className="text-sm font-medium text-green-800/80 underline-offset-4 transition hover:text-green-950 hover:underline"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
