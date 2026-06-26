import LoginForm from "./login-form";

// The login screen. The proxy already redirects signed-in users away from here.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16 pt-safe">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <h1 className="font-voice text-4xl text-soil">Grove</h1>
          <p className="mt-3 text-sm leading-6 text-canopy">
            A place you enter, not a screen you check.
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <LoginForm />
      </div>
    </main>
  );
}
