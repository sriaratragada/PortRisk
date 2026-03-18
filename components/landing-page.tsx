"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import gsap from "gsap";
import {
  Activity,
  ArrowRight,
  BarChart3,
  FileCheck,
  GitBranch,
  Lock,
  Shield,
  Sparkles
} from "lucide-react";

type CounterProps = {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
};

function AnimatedCounter({ value, suffix = "", prefix = "", label }: CounterProps) {
  const rounded = useMemo(() => value.toLocaleString("en-US"), [value]);
  return (
    <div className="panel p-3 text-left">
      <p className="font-mono-data text-lg font-semibold text-foreground">
        {prefix}
        {rounded}
        {suffix}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
    </div>
  );
}

const features = [
  {
    icon: Shield,
    title: "Deterministic Risk Scoring",
    description: "Reproducible multi-factor scoring with stable, auditable risk outputs."
  },
  {
    icon: BarChart3,
    title: "Benchmark Attribution",
    description: "Portfolio-versus-benchmark return decomposition with contribution detail."
  },
  {
    icon: FileCheck,
    title: "Audit-Grade Compliance",
    description: "Immutable event trail for holdings changes, risk decisions, and controls."
  },
  {
    icon: GitBranch,
    title: "Research-to-Holding Workflow",
    description: "Move ideas from feed to watchlist to confirmed positions in one workspace."
  }
];

export function LandingPage() {
  const heroRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!heroRef.current) return;
    const nodes = heroRef.current.querySelectorAll(".hero-node");
    const ctx = gsap.context(() => {
      gsap.fromTo(
        nodes,
        { opacity: 0, scale: 0.2 },
        { opacity: 0.7, scale: 1, duration: 0.8, stagger: 0.06, ease: "power2.out" }
      );
      gsap.to(nodes, {
        y: "random(-9, 9)",
        x: "random(-7, 7)",
        duration: 3.2,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        stagger: 0.22
      });
    }, heroRef);

    return () => ctx.revert();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-subtle bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded bg-primary/20 text-primary">
              <Activity className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight">Portfolio Risk & Compliance Engine</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
              Sign In
            </Link>
            <Link
              href="/signup"
              className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90"
            >
              Create Account
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden pb-10 pt-24">
        <div className="absolute inset-0 grid-pattern opacity-40" />
        <div ref={heroRef} className="pointer-events-none absolute inset-0">
          {Array.from({ length: 14 }).map((_, index) => (
            <span
              key={index}
              className="hero-node absolute h-1.5 w-1.5 rounded-full bg-primary/45"
              style={{
                top: `${10 + Math.random() * 80}%`,
                left: `${8 + Math.random() * 84}%`
              }}
            />
          ))}
          <div className="absolute left-[18%] top-[16%] h-72 w-72 rounded-full bg-primary/10 blur-[96px]" />
          <div className="absolute bottom-[14%] right-[18%] h-64 w-64 rounded-full bg-danger/10 blur-[94px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative mx-auto flex w-full max-w-7xl flex-col gap-10 px-4"
        >
          <div className="max-w-4xl">
            <span className="inline-flex items-center gap-1 rounded border border-primary/25 bg-primary/10 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-primary">
              <Sparkles className="h-3 w-3" />
              Enterprise Risk Infrastructure
            </span>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-6xl">
              Portfolio Risk and Compliance
              <span className="block text-primary">for institutional operators</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
              Deterministic risk analytics, benchmark attribution, and audit logging combined in a
              dense workspace built for daily portfolio decisions.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center gap-1 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                Create Account
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/app"
                className="inline-flex items-center gap-1 rounded border border-subtle bg-surface px-4 py-2 text-sm text-foreground transition hover:border-primary/40"
              >
                Open Workspace
              </Link>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <AnimatedCounter value={2400000000000} prefix="$" label="Assets tracked" />
            <AnimatedCounter value={99.97} suffix="%" label="Service uptime" />
            <AnimatedCounter value={12} suffix="ms" label="Risk recompute latency" />
          </div>

          <div className="panel p-4">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 lg:col-span-8">
                <div className="panel-bright p-4">
                  <p className="text-xs text-muted-foreground">Workspace preview</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    {["Performance", "Risk", "Attribution"].map((item, idx) => (
                      <div key={item} className="panel p-3">
                        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{item}</p>
                        <div className="mt-3 h-16 overflow-hidden rounded bg-secondary/70">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${62 + idx * 12}%` }}
                            transition={{ duration: 0.8, delay: idx * 0.12 }}
                            className="h-full bg-primary/35"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="col-span-12 lg:col-span-4">
                <div className="panel-bright h-full p-4">
                  <p className="text-xs font-medium">Trust signals</p>
                  <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                    <p className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-primary" />
                      Audit-ready event history
                    </p>
                    <p className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-primary" />
                      Deterministic computation paths
                    </p>
                    <p className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary" />
                      Benchmark-aware diagnostics
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-12">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, index) => (
            <motion.article
              key={feature.title}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.25, delay: index * 0.06 }}
              className="panel p-4"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded bg-secondary text-primary">
                <feature.icon className="h-4 w-4" />
              </span>
              <h2 className="mt-3 text-sm font-semibold">{feature.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
            </motion.article>
          ))}
        </div>
      </section>
    </div>
  );
}
