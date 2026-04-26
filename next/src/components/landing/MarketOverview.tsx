"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";
import { Activity, Trophy, Flame, Zap, ArrowRight } from "lucide-react";

const markets = [
  {
    id: "cricket",
    title: "Cricket Betting",
    description: "Live odds on Test Matches, ODIs, T20s. Bet on every over, every wicket, every boundary.",
    image: "/images/image_3.png",
    icon: Activity,
    color: "#21c07a",
    stats: "IPL, BBL, CPL • 1000+ Markets",
    liveCount: 12,
  },
  {
    id: "football",
    title: "Football Betting",
    description: "Premier League, Champions League, World Cup. In-play betting with real-time odds updates.",
    image: "/images/image_4.png",
    icon: Trophy,
    color: "#3a8bff",
    stats: "50+ Leagues • Corner, Cards, Goals",
    liveCount: 23,
  },
  {
    id: "horse",
    title: "Horse Racing",
    description: "Major tracks worldwide. Form guides, live streaming, and instant settlement on every race.",
    image: "/images/image_7.png",
    icon: Flame,
    color: "#ffb020",
    stats: "UK, US, AUS • Win/Place/Each-Way",
    liveCount: 8,
  },
  {
    id: "greyhound",
    title: "Greyhound Racing",
    description: "High-speed action with competitive odds. Multiple races daily, instant results.",
    image: "/images/image_5.png",
    icon: Zap,
    color: "#ff3c3c",
    stats: "24/7 Racing • Forecast & Tricast",
    liveCount: 15,
  },
];

function MarketCard({ market, index }: { market: typeof markets[0]; index: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const Icon = market.icon;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 60 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 60 }}
      transition={{ duration: 0.7, delay: index * 0.15, ease: [0.77, 0, 0.175, 1] }}
      className="group relative"
    >
      {/* Animated gradient border */}
      <div className="absolute -inset-[1px] rounded-[var(--r-lg)] bg-gradient-to-r from-transparent via-[var(--c-accent)] to-transparent opacity-0 blur-sm transition-opacity duration-500 group-hover:opacity-100" />
      
      <Link href="/matches" className="block">
        <div className="relative overflow-hidden rounded-[var(--r-lg)] border border-[var(--c-border)] bg-[rgba(28,25,51,0.6)] p-6 shadow-[var(--shadow-1)] backdrop-blur-[10px] transition-all duration-[var(--dur-3)] ease-[var(--ease-operator)] group-hover:-translate-y-4 group-hover:border-[var(--c-accent)] group-hover:shadow-[0_20px_80px_rgba(99,32,232,0.4)]">
          {/* Background image overlay */}
          <div className="pointer-events-none absolute inset-0 opacity-5 transition-opacity duration-500 group-hover:opacity-10">
            <Image src={market.image} alt="" fill className="object-cover" />
          </div>

          {/* Icon badge */}
          <div className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 group-hover:scale-110" style={{ backgroundColor: `${market.color}20` }}>
            <Icon className="h-5 w-5" style={{ color: market.color }} />
          </div>

          {/* Live count badge */}
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-[var(--c-border)] bg-[rgba(20,18,38,0.8)] px-3 py-1 text-xs font-medium backdrop-blur-sm">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ backgroundColor: market.color }} />
            <span className="text-[var(--c-text-muted)]">{market.liveCount} Live Now</span>
          </div>

          {/* Sport image */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.6, delay: index * 0.15 + 0.3, ease: [0.77, 0, 0.175, 1] }}
            className="relative mb-6 h-40 w-full"
          >
            <Image 
              src={market.image} 
              alt={market.title} 
              fill 
              className="object-contain transition-all duration-500 group-hover:scale-110 group-hover:drop-shadow-[0_0_30px_rgba(99,32,232,0.6)]" 
            />
          </motion.div>

          {/* Title */}
          <h3 className="mb-2 font-[family-name:var(--font-display)] text-xl font-semibold tracking-[-0.02em] text-[color:var(--c-text)]">
            {market.title}
          </h3>

          {/* Stats */}
          <p className="mb-3 text-xs font-medium uppercase tracking-wider" style={{ color: market.color }}>
            {market.stats}
          </p>

          {/* Description */}
          <p className="mb-4 text-sm leading-6 text-[color:var(--c-text-muted)]">{market.description}</p>

          {/* CTA */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-[color:var(--c-accent)]">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--c-success)]" />
              Live Betting Available
            </div>
            <div className="flex items-center gap-1 text-sm font-medium text-[color:var(--c-accent)] transition-transform duration-300 group-hover:translate-x-1">
              View Odds
              <ArrowRight className="h-4 w-4" />
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export function MarketOverview() {
  return (
    <section className="relative py-16 md:py-24">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-1/4 top-0 h-[500px] w-[500px] rounded-full opacity-30"
          style={{ background: "radial-gradient(circle, rgba(99,32,232,0.4), rgba(13,11,21,0) 70%)" }}
        />
        <div
          className="absolute right-1/4 top-1/2 h-[400px] w-[400px] rounded-full opacity-25"
          style={{ background: "radial-gradient(circle, rgba(161,121,241,0.35), rgba(13,11,21,0) 70%)" }}
        />
      </div>

      <div className="container relative mx-auto px-4">
        <div className="mb-12 text-center">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mb-4 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.03em] text-[color:var(--c-text)] md:text-4xl"
          >
            Bet on Your Favorite Sports
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mx-auto max-w-2xl text-base leading-7 text-[color:var(--c-text-muted)]"
          >
            Live odds, in-play betting, and instant settlements across Cricket, Football, Horse Racing, and Greyhound Racing.
          </motion.p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {markets.map((market, index) => (
            <MarketCard key={market.id} market={market} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
