"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { cn } from "@/lib/utils";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get("next") ?? "/";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setStatus(null);

    const supabase = createSupabaseBrowserClient();

    if (mode === "login") {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (signInError) {
        setError(signInError.message);
        setPending(false);
        return;
      }

      router.replace(nextUrl as never);
      router.refresh();
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password
    });

    if (signUpError) {
      setError(signUpError.message);
      setPending(false);
      return;
    }

    if (data.session) {
      router.replace("/");
      router.refresh();
      return;
    }

    setStatus("Account created. Check your email to confirm your account, then sign in.");
    setPending(false);
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative hidden overflow-hidden bg-slate-950 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.3),transparent_28%),radial-gradient(circle_at_70%_20%,rgba(34,197,94,0.18),transparent_24%),linear-gradient(160deg,#020617_20%,#08111f_100%)]" />
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(148,163,184,0.11)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.11)_1px,transparent_1px)] [background-size:34px_34px]" />
        <div className="relative px-12 py-12">
          <p className="font-mono text-xs uppercase tracking-[0.35em] text-cyan-300">Portfolio Risk Engine</p>
        </div>
        <div className="relative px-12 pb-16">
          <div className="max-w-xl space-y-6">
            <h1 className="text-5xl font-semibold tracking-tight text-white">
              Build portfolios like an operator, not a spreadsheet.
            </h1>
            <p className="text-lg leading-8 text-slate-300">
              Realtime exposure, stress testing, and immutable audit trails in one secure workspace.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ["Realtime", "Live value, P&L, and risk tier changes"],
                ["Compliant", "Append-only risk decisions and portfolio actions"],
                ["Fast", "Edge-scored risk metrics and scenario analysis"]
              ].map(([title, copy]) => (
                <div key={title} className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-2 text-sm text-slate-400">{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-12 sm:px-8">
        <div className="w-full max-w-md rounded-[2rem] border border-slate-800 bg-panel/90 p-8 shadow-panel backdrop-blur">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              {mode === "login" ? "Secure Login" : "Create Account"}
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-white">
              {mode === "login" ? "Welcome back" : "Open your risk workspace"}
            </h2>
            <p className="mt-3 text-sm text-slate-400">
              {mode === "login"
                ? "Access your portfolios, risk history, and live exposure dashboard."
                : "Create an account to save portfolios, risk scores, and stress test history."}
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-sm text-slate-300">Email</span>
              <input
                className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm outline-none transition focus:border-cyan-400"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm text-slate-300">Password</span>
              <input
                className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm outline-none transition focus:border-cyan-400"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
            </label>

            {(error || status) && (
              <div
                className={cn(
                  "rounded-2xl px-4 py-3 text-sm",
                  error ? "bg-danger/10 text-danger" : "bg-success/10 text-success"
                )}
              >
                {error ?? status}
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {pending ? "Working..." : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-400">
            {mode === "login" ? "New here?" : "Already have an account?"}{" "}
            <Link
              className="font-medium text-cyan-300 transition hover:text-cyan-200"
              href={mode === "login" ? "/signup" : "/login"}
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
