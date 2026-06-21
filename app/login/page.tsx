import LoginForm from "./login-form";

// The login screen. The proxy already redirects signed-in users away from here.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-green-950">
            Grove
          </h1>
          <p className="mt-2 text-sm text-green-800/70">
            Sign in with your email to continue.
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <LoginForm />
      </div>
    </main>
  );
}
