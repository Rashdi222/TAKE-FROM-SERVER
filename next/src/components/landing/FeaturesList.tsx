"use client";

import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";
import { Wallet, Radio, Shield, Headphones } from "lucide-react";

const features = [
  {
    title: "Fast Deposits & Withdrawals",
    description: "Instant deposits and quick withdrawals. Multiple payment methods supported for your convenience.",
    icon: Wallet,
    color: "#64b513",
    stats: "• Crypto, Cards, E-Wallets • Instant Processing",
    badge: "< 5min",
    number: "01",
  },
  {
    title: "Live Betting 24/7",
    description: "Never miss a moment. Bet live on matches as they happen with real-time odds updates.",
    icon: Radio,
    color: "#6320e8",
    stats: "• 10,000+ Events Monthly • Real-Time Updates",
    badge: "24/7",
    number: "02",
  },
  {
    title: "Secure Platform",
    description: "Bank-grade encryption and secure transactions. Your funds and data are always protected.",
    icon: Shield,
    color: "#3a8bff",
    stats: "• 256-bit SSL • PCI Compliant • Licensed",
    badge: "SSL",
    number: "03",
  },
  {
    title: "24/7 Support",
    description: "Our support team is always here to help. Get assistance anytime, day or night.",
    icon: Headphones,
    color: "#ffb020",
    stats: "• Live Chat • Email • Phone • < 2min Response",
    badge: "Live",
    number: "04",
  },
];

export function FeaturesList() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section ref={ref} className="relative py-16 md:py-24">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute right-1/3 top-0 h-[450px] w-[450px] rounded-full opacity-25"
          style={{ background: "radial-gradient(circle, rgba(161,121,241,0.4), rgba(13,11,21,0) 70%)" }}
        />
      </div>

      <div className="container relative mx-auto px-4">
        <div className="mb-12 text-center">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6 }}
            className="mb-4 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.03em] text-[color:var(--c-text)] md:text-4xl"
          >
            Why Choose Sixerbat?
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mx-auto max-w-2xl text-base leading-7 text-[color:var(--c-text-muted)]"
          >
            Everything you need for a premium betting experience, all in one place.
          </motion.p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 40 }}
                animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
                transition={{ duration: 0.6, delay: index * 0.1, ease: [0.77, 0, 0.175, 1] }}
                whileHover={{ y: -8, rotateY: 5 }}
                className="group relative"
              >
                {/* Animated gradient border */}
                <div className="absolute -inset-[1px] rounded-[var(--r-lg)] bg-gradient-to-r from-transparent via-[var(--c-accent)] to-transparent opacity-0 blur-sm transition-opacity duration-500 group-hover:opacity-100" />

                <div className="relative overflow-hidden rounded-[var(--r-lg)] border border-[var(--c-border)] bg-[rgba(28,25,51,0.6)] p-6 shadow-[var(--shadow-1)] backdrop-blur-[10px] transition-all duration-[var(--dur-3)] ease-[var(--ease-operator)] group-hover:border-[var(--c-accent)] group-hover:shadow-[0_20px_60px_rgba(99,32,232,0.3)]">
                  {/* Gradient overlay */}
                  <div
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-10"
                    style={{
                      background: `linear-gradient(135deg, ${feature.color}40, transparent)`,
                    }}
                  />

                  {/* Number badge */}
                  <div className="absolute right-4 top-4 font-[family-name:var(--font-display)] text-4xl font-bold opacity-5">
                    {feature.number}
                  </div>

                  {/* Trust badge */}
                  <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-[var(--c-border)] bg-[rgba(20,18,38,0.8)] px-2.5 py-1 text-xs font-medium backdrop-blur-sm">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ backgroundColor: feature.color }} />
                    <span className="text-[var(--c-text-muted)]">{feature.badge}</span>
                  </div>

                  {/* Icon with animated glow */}
                  <motion.div
                    whileHover={{ rotate: 360, scale: 1.1 }}
                    transition={{ duration: 0.6, ease: [0.77, 0, 0.175, 1] }}
                    className="relative mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${feature.color}20` }}
                  >
                    <div
                      className="absolute inset-0 rounded-full opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-60"
                      style={{ backgroundColor: feature.color }}
                    />
                    <Icon className="relative h-8 w-8" style={{ color: feature.color }} />
                  </motion.div>

                  {/* Title */}
                  <h3 className="mb-2 font-[family-name:var(--font-display)] text-lg font-semibold tracking-[-0.02em] text-[color:var(--c-text)]">
                    {feature.title}
                  </h3>

                  {/* Description */}
                  <p className="mb-3 text-sm leading-6 text-[color:var(--c-text-muted)]">{feature.description}</p>

                  {/* Stats */}
                  <p className="text-xs leading-5 text-[color:var(--c-text-faint)]">{feature.stats}</p>

                  {/* Progress indicator */}
                  <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.05)]">
                    <motion.div
                      initial={{ width: "0%" }}
                      animate={isInView ? { width: "100%" } : { width: "0%" }}
                      transition={{ duration: 1, delay: index * 0.1 + 0.5, ease: "easeOut" }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: feature.color }}
                    />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
