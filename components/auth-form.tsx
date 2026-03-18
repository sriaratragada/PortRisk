"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { Activity, ArrowRight, Shield, Sparkles } from "lucide-react";
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
  const nextUrl = searchParams.get("next") ?? "/app";

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
      router.replace("/app");
      router.refresh();
      return;
    }

    setStatus("Account created. Check your email to confirm your account, then sign in.");
    setPending(false);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 grid-pattern opacity-25" />
        <div className="absolute -top-20 -left-10 h-[520px] w-[520px] rounded-full bg-primary/14 blur-[160px]" />
        <div className="absolute top-1/3 right-[-18%] h-[620px] w-[620px] rounded-full bg-destructive/10 blur-[160px]" />
      </div>

      <div className="relative grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
        <section className="relative hidden overflow-hidden bg-surface lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background/30 to-background" />
          <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(hsl(var(--border)/0.25)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/0.25)_1px,transparent_1px)] [background-size:48px_48px]" />
          <div className="relative flex items-center justify-between px-12 py-10">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 text-primary">
                <Activity className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">PMP</p>
                <p className="text-sm font-semibold text-foreground">Portfolio Management Platform</p>
              </div>
            </div>
            <span className="rounded-full border border-border/60 px-3 py-1 text-[11px] text-muted-foreground">
              Secure by design
            </span>
          </div>
          <div className="relative px-12 pb-16">
            <div className="max-w-xl animate-[slideUpSoft_420ms_ease-out] space-y-6">
              <h1 className="max-w-lg text-5xl font-semibold tracking-[-0.04em] text-foreground">
                Operate portfolios with confidence.
              </h1>
              <p className="max-w-lg text-lg leading-8 text-muted-foreground">
                Realtime exposure, stress testing, deterministic risk scoring, and immutable audit trails in one workspace.
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  ["Deterministic", "Edge-scored risk, reproducible every time."],
                  ["Compliant", "Append-only audit evidence with RLS everywhere."],
                  ["Realtime", "Live value, P&L, stress, and alerts in <15ms." ]
                ].map(([title, copy]) => (
                  <div
                    key={title}
                    className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 backdrop-blur-sm transition duration-300 hover:border-white/20 hover:bg-white/[0.06]"
                  >
                    <p className="text-sm font-semibold text-foreground">{title}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{copy}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="relative flex items-center justify-center px-6 py-12 sm:px-8">
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background to-background/80 lg:hidden" />
          <div className="relative w-full max-w-md animate-[fadeScaleIn_320ms_ease-out] rounded-3xl border border-white/10 bg-surface/90 p-8 shadow-panel backdrop-blur-xl">
            <div className="mb-8 flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  {mode === "login" ? "Secure Login" : "Create Account"}
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-foreground">
                  {mode === "login" ? "Welcome back" : "Open your PMP workspace"}
                </h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  {mode === "login"
                    ? "Access your portfolios, risk history, and live exposure dashboard."
                    : "Create an account to save portfolios, risk scores, and stress tests."}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Shield className="h-4 w-4" />
              </div>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="block space-y-2">
                <span className="text-sm text-muted-foreground">Email</span>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-primary/40 focus:bg-black/70"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm text-muted-foreground">Password</span>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-primary/40 focus:bg-black/70"
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
                className="group w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-[0_18px_40px_rgba(0,0,0,0.35)] transition hover:-translate-y-0.5 hover:shadow-primary/35 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <span className="inline-flex items-center justify-center gap-2">
                  {pending ? "Working..." : mode === "login" ? "Sign In" : "Create Account"}
                  <ArrowRight className="h-4 w-4" />
                </span>
              </button>
            </form>

            <p className="mt-6 text-sm text-muted-foreground">
              {mode === "login" ? "New here?" : "Already have an account?"}{" "}
              <Link
                className="font-medium text-primary transition hover:text-primary/80"
                href={mode === "login" ? "/signup" : "/login"}
              >
                {mode === "login" ? "Create an account" : "Sign in"}
              </Link>
            </p>

            <div className="mt-6 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Deterministic • Auditable • Realtime</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
