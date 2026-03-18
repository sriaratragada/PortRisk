"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { motion, type Variants } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  Activity,
  ArrowRight,
  BarChart3,
  ChevronRight,
  FileCheck,
  GitBranch,
  Lock,
  Shield
} from "lucide-react";
import { AnimatedCounter } from "@/components/landing/animated-counter";
import { FeatureCard } from "@/components/landing/feature-card";
import { MockDashboard } from "@/components/landing/mock-dashboard";

gsap.registerPlugin(ScrollTrigger);

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } }
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
};

const features = [
  {
    icon: Shield,
    title: "Deterministic Risk Scoring",
    description: "Multi-factor scoring with reproducible, auditable outputs for every holding."
  },
  {
    icon: BarChart3,
    title: "Benchmark Attribution",
    description: "Brinson-style attribution with realtime benchmark-relative performance context."
  },
  {
    icon: FileCheck,
    title: "Audit-Grade Compliance",
    description: "Immutable audit logging with RLS, append-only writes, and evidence snapshots."
  },
  {
    icon: GitBranch,
    title: "Research-to-Holding",
    description: "From idea to watchlist to confirmed positions without leaving the workspace."
  }
];

const trustItems = [
  { icon: Lock, label: "RLS Everywhere" },
  { icon: Activity, label: "Deterministic Analytics" },
  { icon: Shield, label: "Audit-Ready Trail" }
];

export function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const heroImageRef = useRef<HTMLDivElement>(null);
  const orb1Ref = useRef<HTMLDivElement>(null);
  const orb2Ref = useRef<HTMLDivElement>(null);
  const orb3Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ctx = gsap.context(() => {
      if (heroImageRef.current) {
        gsap.to(heroImageRef.current, {
          yPercent: 25,
          ease: "none",
          scrollTrigger: {
            trigger: containerRef.current,
            start: "top top",
            end: "bottom top",
            scrub: 0.5
          }
        });
      }

      const orbs = [orb1Ref.current, orb2Ref.current, orb3Ref.current];
      orbs.forEach((orb, i) => {
        if (!orb) return;
        gsap.to(orb, {
          x: "random(-40, 40)",
          y: "random(-30, 30)",
          duration: 6 + i * 2,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true
        });
        gsap.to(orb, {
          yPercent: 30 + i * 20,
          xPercent: (i % 2 === 0 ? 1 : -1) * 15,
          ease: "none",
          scrollTrigger: {
            trigger: containerRef.current,
            start: "top top",
            end: "bottom top",
            scrub: 1 + i * 0.3
          }
        });
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="min-h-screen overflow-x-hidden bg-background">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/50 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/20 text-primary">
              <Activity className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight">PRCE</span>
          </div>
          <nav className="hidden items-center gap-6 text-xs text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">
              Features
            </a>
            <a href="#preview" className="transition-colors hover:text-foreground">
              Platform
            </a>
            <a href="#trust" className="transition-colors hover:text-foreground">
              Security
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="text-xs font-semibold text-muted-foreground hover:text-foreground">
              Sign In
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:border-primary/60 hover:bg-primary/15"
            >
              Create Account
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-14">
        <div
          ref={heroImageRef}
          className="absolute inset-0 -top-20 -bottom-20"
          style={{
            backgroundImage: "url(/hero-bg.jpg)",
            backgroundSize: "cover",
            backgroundPosition: "center 40%"
          }}
        />
        <div className="absolute inset-0 bg-background/60" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-transparent to-background" />

        <div
          ref={orb1Ref}
          className="absolute left-[20%] top-[15%] h-[500px] w-[500px] rounded-full opacity-30"
          style={{
            background: "radial-gradient(circle, hsl(var(--primary) / 0.4) 0%, transparent 70%)",
            filter: "blur(80px)"
          }}
        />
        <div
          ref={orb2Ref}
          className="absolute right-[10%] top-[50%] h-[400px] w-[400px] rounded-full opacity-20"
          style={{
            background: "radial-gradient(circle, hsl(30 90% 55% / 0.5) 0%, transparent 70%)",
            filter: "blur(100px)"
          }}
        />
        <div
          ref={orb3Ref}
          className="absolute bottom-[10%] left-[40%] h-[600px] w-[600px] rounded-full opacity-15"
          style={{
            background: "radial-gradient(circle, hsl(var(--primary) / 0.3) 0%, transparent 70%)",
            filter: "blur(120px)"
          }}
        />
        <div className="absolute inset-0 grid-pattern opacity-20" />

        <motion.div
          className="relative z-10 mx-auto max-w-5xl px-4 text-center"
          variants={stagger}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={fadeUp} className="mb-4">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-glow" />
              Enterprise Risk Infrastructure
            </span>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="mb-5 text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl lg:text-7xl"
          >
            Portfolio Risk &<br />
            <span className="text-primary">Compliance Engine</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mx-auto mb-8 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg"
          >
            Deterministic analytics, audit-grade logging, and research-to-holding workflows for
            institutional operators.
          </motion.p>

          <motion.div variants={fadeUp} className="flex items-center justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xl shadow-primary/35 transition hover:-translate-y-0.5 hover:shadow-primary/45"
            >
              Create Account
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-4 py-2 text-sm font-semibold text-primary transition hover:border-primary/60 hover:bg-primary/10"
            >
              Sign In
            </Link>
          </motion.div>

          <motion.div variants={fadeUp} className="mx-auto mt-14 grid max-w-md grid-cols-3 gap-6">
            <AnimatedCounter value={2.4} suffix="T" label="Assets Monitored" prefix="$" />
            <AnimatedCounter value={99.97} suffix="%" label="Uptime SLA" />
            <AnimatedCounter value={12} suffix="ms" label="Calc Latency" />
          </motion.div>
        </motion.div>

        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
      </section>

      <section id="features" className="relative py-20 px-4">
        <motion.div
          className="mx-auto max-w-6xl"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={stagger}
        >
          <motion.div variants={fadeUp} className="mb-12 text-center">
            <h2 className="mb-3 text-2xl font-semibold tracking-tight md:text-3xl">
              Institutional-Grade Analytics
            </h2>
            <p className="mx-auto max-w-lg text-sm text-muted-foreground">
              Every computation is deterministic, every action is logged, every insight is
              attributable.
            </p>
          </motion.div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {features.map((f, i) => (
              <motion.div key={f.title} variants={fadeUp}>
                <FeatureCard icon={f.icon} title={f.title} description={f.description} index={i} />
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      <section id="preview" className="py-20 px-4">
        <motion.div
          className="mx-auto max-w-6xl"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={stagger}
        >
          <motion.div variants={fadeUp} className="mb-10 text-center">
            <h2 className="mb-3 text-2xl font-semibold tracking-tight md:text-3xl">The Workstation</h2>
            <p className="mx-auto max-w-lg text-sm text-muted-foreground">
              Dense, information-rich workspace with holdings, research, risk, stress, allocation,
              and audit at a glance.
            </p>
          </motion.div>
          <motion.div variants={fadeUp}>
            <MockDashboard />
          </motion.div>
        </motion.div>
      </section>

      <section id="trust" className="border-t border-border py-16 px-4">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-center gap-8 md:flex-row">
          {trustItems.map((item) => (
            <motion.div
              key={item.label}
              className="flex items-center gap-2.5 text-sm text-muted-foreground"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <item.icon className="h-4 w-4 text-primary/60" />
              <span>{item.label}</span>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="py-20 px-4">
        <motion.div
          className="mx-auto max-w-2xl text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="mb-3 text-2xl font-semibold tracking-tight md:text-3xl">
            Ready to upgrade your risk infrastructure?
          </h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Deploy in minutes. Supabase auth + RLS, Prisma schema, Yahoo Finance sourcing, and Upstash
            rate limits are already wired.
          </p>
          <div className="flex justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xl shadow-primary/35 transition hover:-translate-y-0.5 hover:shadow-primary/45"
            >
              Get Started <ChevronRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-4 py-2 text-sm font-semibold text-primary transition hover:border-primary/60 hover:bg-primary/10"
            >
              Sign In
            </Link>
          </div>
        </motion.div>
      </section>

      <footer className="border-t border-border py-8 px-4">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-xs text-muted-foreground md:flex-row">
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-primary/60" />
            <span>Portfolio Risk & Compliance Engine</span>
          </div>
          <div className="flex gap-6">
            <span>Documentation</span>
            <span>API</span>
            <span>Status</span>
            <span>Security</span>
          </div>
          <span>© 2026 PRCE. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
