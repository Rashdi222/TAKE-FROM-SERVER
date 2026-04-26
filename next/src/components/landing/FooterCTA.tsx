"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";
import { Sparkles } from "lucide-react";

export function FooterCTA() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section ref={ref} className="container mx-auto px-4 pb-20">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
        transition={{ duration: 0.8, ease: [0.77, 0, 0.175, 1] }}
        className="relative overflow-hidden rounded-[var(--r-lg)] border border-[var(--c-border-strong)] bg-[radial-gradient(circle_at_50%_20%,rgba(99,32,232,0.25),rgba(20,18,38,0.9)_70%)] p-8 shadow-[var(--shadow-2)] md:p-12"
      >
        <div className="pointer-events-none absolute inset-0">
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.35, 0.2] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[color:var(--c-accent)] blur-[120px]"
          />
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.15, 0.3, 0.15] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-[rgba(161,121,241,0.6)] blur-[100px]"
          />
        </div>

        <div className="relative flex flex-col items-center gap-6 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={isInView ? { scale: 1 } : { scale: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: [0.77, 0, 0.175, 1] }}
            className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[color:var(--c-accent)] shadow-[0_0_60px_rgba(99,32,232,0.6)]"
          >
            <Sparkles className="h-8 w-8 text-[color:var(--c-text)]" />
          </motion.div>

          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mb-2 text-xs uppercase tracking-[0.2em] text-[color:var(--c-accent)]"
            >
              Ready to Win?
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="mb-3 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.03em] text-[color:var(--c-text)] md:text-4xl"
            >
              Sign Up & Get Your Welcome Bonus
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="mx-auto max-w-2xl text-sm text-[color:var(--c-text-muted)] md:text-base"
            >
              Join thousands of players betting on live sports. Start with a bonus and experience the thrill of winning.
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <Link
              href="/register"
              className="group relative inline-flex items-center justify-center overflow-hidden rounded-full border border-[rgba(161,121,241,0.26)] bg-[color:var(--c-accent)] px-8 py-4 text-sm font-medium text-[color:var(--c-text)] shadow-[0_12px_56px_rgba(99,32,232,0.24)] transition-transform duration-[var(--dur-3)] ease-[var(--ease-operator)] hover:-translate-y-1.5 hover:bg-[color:var(--c-accent-2)]"
            >
              <span className="absolute inset-0 animate-pulse bg-[color:var(--c-accent-glow)] opacity-0 group-hover:opacity-30" />
              Sign Up Now
              <span className="ml-2 transition-transform duration-[var(--dur-2)] group-hover:translate-x-0.5">→</span>
            </Link>
            <Link
              href="/matches"
              className="inline-flex items-center justify-center rounded-full border border-[var(--c-accent)] bg-transparent px-8 py-4 text-sm font-medium text-[color:var(--c-text-muted)] transition-all duration-[var(--dur-3)] ease-[var(--ease-operator)] hover:-translate-y-0.5 hover:bg-[var(--c-accent-soft)] hover:text-[var(--c-text)]"
            >
              Browse Matches
            </Link>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}
