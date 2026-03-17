"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ChartCandlestick,
  LineChart,
  ShieldCheck
} from "lucide-react";
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
    <div className="grid min-h-screen lg:grid-cols-[1.22fr_0.78fr]">
      <section className="relative hidden overflow-hidden border-r border-white/[0.08] lg:flex">
        <img
          src="https://images.unsplash.com/photo-1642543348745-8f8e7d3f73f1?auto=format&fit=crop&w=1800&q=80"
          alt="Finance dashboard visualization"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#070b10]/85 via-[#0b1118]/78 to-[#0f1622]/92" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:32px_32px] opacity-20" />

        <div className="relative z-10 flex h-full w-full flex-col p-10">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Portfolio Risk Engine</p>
            <div className="rounded-md border border-white/[0.12] bg-black/30 px-2.5 py-1 text-xs text-slate-300">
              Yahoo-powered
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="mt-14 max-w-2xl space-y-4"
          >
            <h1 className="text-4xl font-semibold tracking-[-0.03em] text-white">
              Institutional portfolio intelligence in one workspace.
            </h1>
            <p className="max-w-xl text-sm leading-7 text-slate-300">
              Monitor allocations, benchmark-relative performance, deterministic risk, and research memos with a compact analyst interface.
            </p>
          </motion.div>

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {[
              { title: "Live pricing", value: "1,200+", icon: LineChart },
              { title: "Coverage", value: "Global equities", icon: ChartCandlestick },
              { title: "Risk engine", value: "Deterministic", icon: ShieldCheck }
            ].map((item) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="rounded-xl border border-white/[0.1] bg-black/30 p-3"
              >
                <div className="flex items-center gap-2 text-slate-300">
                  <item.icon className="h-4 w-4" />
                  <p className="text-xs">{item.title}</p>
                </div>
                <p className="mt-3 text-lg font-semibold text-white">{item.value}</p>
              </motion.div>
            ))}
          </div>

          <div className="mt-auto grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/[0.1] bg-black/35 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-white">Portfolio pulse</p>
                <Activity className="h-4 w-4 text-slate-300" />
              </div>
              <div className="mt-3 grid grid-cols-8 gap-1.5">
                {[42, 37, 54, 49, 58, 46, 62, 57].map((value, index) => (
                  <div key={index} className="flex h-16 items-end rounded-sm bg-white/[0.08]">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${value}%` }}
                      transition={{ duration: 0.4, delay: index * 0.04 }}
                      className="rounded-sm bg-white/70"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.1] bg-black/35 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-white">Compliance state</p>
                <AlertTriangle className="h-4 w-4 text-warning" />
              </div>
              <p className="mt-3 text-sm text-slate-300">
                Audit logs are immutable. Risk decisions are timestamped and tied to holdings state.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-8 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="w-full max-w-md rounded-xl border border-white/[0.1] bg-panel/85 p-6 shadow-panel backdrop-blur-md"
        >
          <div className="mb-6">
            <p className="text-xs font-medium text-slate-400">
              {mode === "login" ? "Secure login" : "Create account"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-white">
              {mode === "login" ? "Welcome back" : "Create your workspace"}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              {mode === "login"
                ? "Access portfolio risk, research pipeline, and benchmark attribution."
                : "Create an account to save portfolios, watchlists, and risk history."}
            </p>
          </div>

          <form className="space-y-3.5" onSubmit={handleSubmit}>
            <label className="block space-y-1.5">
              <span className="text-sm text-slate-300">Email</span>
              <input
                className="w-full rounded-lg border border-white/[0.12] bg-[#0d131d] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-white/[0.22]"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm text-slate-300">Password</span>
              <input
                className="w-full rounded-lg border border-white/[0.12] bg-[#0d131d] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-white/[0.22]"
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
                  "rounded-lg px-3.5 py-2.5 text-sm",
                  error ? "bg-danger/10 text-danger" : "bg-success/10 text-success"
                )}
              >
                {error ?? status}
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {pending ? "Working..." : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="mt-5 text-sm text-slate-400">
            {mode === "login" ? "New here?" : "Already have an account?"}{" "}
            <Link
              className="font-medium text-zinc-200 transition hover:text-white"
              href={mode === "login" ? "/signup" : "/login"}
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </Link>
          </p>
        </motion.div>
      </section>
    </div>
  );
}
