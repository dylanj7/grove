import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Root: send signed-in users into the grove, everyone else to login.
export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  redirect(user ? "/grove" : "/login");
}
