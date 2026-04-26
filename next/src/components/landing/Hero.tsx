"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { TrendingUp, Zap, Shield } from "lucide-react";

export function Hero() {
  return (
    <section className="relative overflow-hidden py-20 md:py-32">
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          animate={{ y: [0, -20, 0], opacity: [0.5, 0.7, 0.5] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-24 left-[-140px] h-[420px] w-[420px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(99,32,232,0.55), rgba(13,11,21,0) 70%)" }}
        />
        <motion.div
          animate={{ y: [0, 20, 0], opacity: [0.4, 0.6, 0.4] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-10 right-[-180px] h-[520px] w-[520px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(161,121,241,0.45), rgba(13,11,21,0) 70%)" }}
        />
      </div>

      <div className="container relative mx-auto px-4">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div className="text-center md:text-left">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.77, 0, 0.175, 1] }}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--c-border)] bg-[rgba(255,255,255,0.04)] px-4 py-2 text-xs uppercase tracking-[0.16em] text-[color:var(--c-text-muted)]"
            >
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[color:var(--c-success)]" />
              Live Betting Now
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1, ease: [0.77, 0, 0.175, 1] }}
              className="mb-6 font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight tracking-[-0.04em] text-[color:var(--c-text)] md:text-6xl"
            >
              Bet Live. Win Big.
              <span className="block text-[color:var(--c-accent)]">Your Game Starts Here.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2, ease: [0.77, 0, 0.175, 1] }}
              className="mb-8 max-w-xl text-base leading-7 text-[color:var(--c-text-muted)] md:text-lg"
            >
              Experience real-time odds on Cricket, Football, Horse Racing, and Greyhound. Fast deposits, instant withdrawals, and 24/7 live betting action.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3, ease: [0.77, 0, 0.175, 1] }}
              className="mb-8 flex flex-col gap-4 sm:flex-row"
            >
              <Link
                href="/register"
                className="group relative inline-flex items-center justify-center overflow-hidden rounded-full border border-[rgba(161,121,241,0.26)] bg-[color:var(--c-accent)] px-8 py-4 text-sm font-medium text-[color:var(--c-text)] shadow-[0_12px_56px_rgba(99,32,232,0.24)] transition-transform duration-[var(--dur-3)] ease-[var(--ease-operator)] hover:-translate-y-1.5 hover:bg-[color:var(--c-accent-2)]"
              >
                <span className="absolute inset-0 animate-pulse bg-[color:var(--c-accent-glow)] opacity-0 group-hover:opacity-30" />
                Start Betting Now
                <span className="ml-2 transition-transform duration-[var(--dur-2)] group-hover:translate-x-0.5">→</span>
              </Link>
              <Link
                href="/matches"
                className="group relative inline-flex items-center justify-center overflow-hidden rounded-full border border-[var(--c-accent)] bg-transparent px-8 py-4 text-sm font-medium text-[color:var(--c-text-muted)] transition-all duration-[var(--dur-3)] ease-[var(--ease-operator)] hover:-translate-y-0.5 hover:bg-[var(--c-accent-soft)] hover:text-[var(--c-text)]"
              >
                View Live Matches
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="flex flex-wrap items-center justify-center gap-6 md:justify-start"
            >
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-[color:var(--c-success)]" />
                <span className="text-sm text-[color:var(--c-text-muted)]">Live Odds</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-[color:var(--c-warning)]" />
                <span className="text-sm text-[color:var(--c-text-muted)]">Instant Payouts</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-[color:var(--c-info)]" />
                <span className="text-sm text-[color:var(--c-text-muted)]">Secure Platform</span>
              </div>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9, rotateY: -15 }}
            animate={{ opacity: 1, scale: 1, rotateY: 0 }}
            transition={{ duration: 0.8, ease: [0.77, 0, 0.175, 1] }}
            className="relative"
          >
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="relative h-[400px] w-full md:h-[500px]"
            >
              <Image
                src="/images/image_6.png"
                alt="Sixerbat Sports Betting"
                fill
                className="object-contain drop-shadow-[0_0_80px_rgba(99,32,232,0.4)]"
                priority
              />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
