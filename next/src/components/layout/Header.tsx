"use client";

import { useSyncExternalStore, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useScroll, useMotionValueEvent, useMotionValue, useSpring } from "framer-motion";
import { Menu, X } from "lucide-react";
import { getAccessToken } from "@/lib/auth/session";
import { userApi } from "@/lib/api";
import { Button } from "../ui/Button";
import { LogoutButton } from "../auth/LogoutButton";

function subscribe() {
  return () => {};
}

export function Header() {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userCount, setUserCount] = useState(1234);
  const [rolePath, setRolePath] = useState<string | null>(null);
  const { scrollY } = useScroll();
  const headerRef = useRef<HTMLDivElement>(null);
  
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const smoothMouseX = useSpring(mouseX, { stiffness: 50, damping: 20 });
  const smoothMouseY = useSpring(mouseY, { stiffness: 50, damping: 20 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (headerRef.current) {
        const rect = headerRef.current.getBoundingClientRect();
        mouseX.set(e.clientX - rect.left);
        mouseY.set(e.clientY - rect.top);
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  useEffect(() => {
    const interval = setInterval(() => {
      setUserCount((prev) => prev + Math.floor(Math.random() * 3) - 1);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious() ?? 0;
    if (latest > previous && latest > 150) {
      setHidden(true);
      setMobileMenuOpen(false);
    } else {
      setHidden(false);
    }
  });

  const isAuthenticated = useSyncExternalStore(
    subscribe,
    () => !!getAccessToken(),
    () => false
  );

  useEffect(() => {
    let cancelled = false;

    async function loadRolePath() {
      if (!isAuthenticated) {
        setRolePath(null);
        return;
      }

      try {
        const response = (await userApi.auth.me()) as { user?: { role?: string } };
        const role = response.user?.role;

        if (cancelled) return;

        setRolePath(
          role === "super_admin"
            ? "/admin/dashboard"
            : role === "master_admin"
            ? "/master/dashboard"
            : "/profile",
        );
      } catch {
        if (!cancelled) {
          setRolePath("/profile");
        }
      }
    }

    loadRolePath();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const hideOnAuthPages = pathname === "/login" || pathname === "/register";
  if (hideOnAuthPages) return null;

  return (
    <>
      <motion.header
        ref={headerRef}
        variants={{
          visible: { y: 0, opacity: 1 },
          hidden: { y: -100, opacity: 0 },
        }}
        animate={hidden ? "hidden" : "visible"}
        transition={{ duration: 0.4, ease: [0.77, 0, 0.175, 1] }}
        className="fixed inset-x-0 top-3 z-[60] px-3 md:top-4 md:px-4"
      >
        <div className="mx-auto w-full max-w-7xl">
        <div className="relative overflow-hidden rounded-[1.6rem] border border-[rgba(161,121,241,0.25)] shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          {/* Animated mesh gradient background */}
          <motion.div
            className="absolute inset-0"
            animate={{
              background: [
                "radial-gradient(circle at 0% 0%, rgba(99,32,232,0.15), transparent 50%), radial-gradient(circle at 100% 100%, rgba(161,121,241,0.12), transparent 50%), rgba(20,18,38,0.7)",
                "radial-gradient(circle at 100% 0%, rgba(161,121,241,0.15), transparent 50%), radial-gradient(circle at 0% 100%, rgba(99,32,232,0.12), transparent 50%), rgba(20,18,38,0.7)",
                "radial-gradient(circle at 0% 0%, rgba(99,32,232,0.15), transparent 50%), radial-gradient(circle at 100% 100%, rgba(161,121,241,0.12), transparent 50%), rgba(20,18,38,0.7)",
              ],
            }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            style={{ backdropFilter: "blur(20px)" }}
          />

          {/* Particle system */}
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              className="pointer-events-none absolute h-1 w-1 rounded-full bg-[var(--c-accent)]"
              style={{
                left: `${10 + i * 12}%`,
                top: `${30 + (i % 3) * 20}%`,
                opacity: 0.3,
              }}
              animate={{
                y: [0, -10, 0],
                x: [0, Math.sin(i) * 5, 0],
                opacity: [0.3, 0.6, 0.3],
              }}
              transition={{
                duration: 3 + i * 0.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          ))}

          {/* Spotlight cursor follow */}
          <motion.div
            className="pointer-events-none absolute h-32 w-32 rounded-full opacity-0 blur-3xl transition-opacity duration-300 hover:opacity-20"
            style={{
              background: "radial-gradient(circle, rgba(99,32,232,0.8), transparent 70%)",
              x: smoothMouseX,
              y: smoothMouseY,
              translateX: "-50%",
              translateY: "-50%",
            }}
          />

          {/* Scanline sweep */}
          <motion.div
            className="pointer-events-none absolute inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[var(--c-accent)] to-transparent opacity-30"
            animate={{
              top: ["0%", "100%"],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "linear",
            }}
          />

          {/* Corner brackets */}
          <div className="pointer-events-none absolute left-2 top-2 h-4 w-4 border-l-2 border-t-2 border-[var(--c-accent)] opacity-40" />
          <div className="pointer-events-none absolute right-2 top-2 h-4 w-4 border-r-2 border-t-2 border-[var(--c-accent)] opacity-40" />
          <div className="pointer-events-none absolute bottom-2 left-2 h-4 w-4 border-b-2 border-l-2 border-[var(--c-accent)] opacity-40" />
          <div className="pointer-events-none absolute bottom-2 right-2 h-4 w-4 border-b-2 border-r-2 border-[var(--c-accent)] opacity-40" />

          {/* Animated border gradient */}
          <motion.div
            className="absolute inset-0 rounded-full opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            animate={{
              background: [
                "linear-gradient(0deg, transparent, rgba(99,32,232,0.5), transparent)",
                "linear-gradient(90deg, transparent, rgba(161,121,241,0.5), transparent)",
                "linear-gradient(180deg, transparent, rgba(99,32,232,0.5), transparent)",
                "linear-gradient(270deg, transparent, rgba(161,121,241,0.5), transparent)",
                "linear-gradient(360deg, transparent, rgba(99,32,232,0.5), transparent)",
              ],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          />

          <div className="relative flex h-14 min-w-0 items-center justify-between gap-3 px-3 md:h-16 md:px-6">
            <Link href="/" className="group flex min-w-0 flex-1 items-center gap-2 md:max-w-[20rem] md:flex-none md:gap-3">
              <motion.div
                whileHover={{ rotateY: 360 }}
                transition={{ duration: 0.8, ease: [0.77, 0, 0.175, 1] }}
                className="relative flex-shrink-0"
              >
                {/* Orbital elements */}
                {[0, 120, 240].map((angle, i) => {
                  const radius = 20;
                  const radians = (angle * Math.PI) / 180;
                  const x = Math.round(Math.cos(radians) * radius * 100) / 100;
                  const y = Math.round(Math.sin(radians) * radius * 100) / 100;
                  
                  return (
                    <motion.div
                      key={i}
                      className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-[var(--c-accent)]"
                      animate={{
                        rotate: [angle, angle + 360],
                      }}
                      transition={{
                        duration: 4,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                      style={{
                        transformOrigin: "0 0",
                        x: x,
                        y: y,
                      }}
                    />
                  );
                })}

                {/* Pulse ring */}
                <motion.div
                  className="absolute inset-0 rounded-lg"
                  animate={{
                    scale: [1, 1.3, 1],
                    opacity: [0.5, 0, 0.5],
                  }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  style={{
                    background: "linear-gradient(135deg, var(--c-accent), var(--c-accent-2))",
                    filter: "blur(8px)",
                  }}
                />

                {/* Holographic shimmer */}
                <motion.div
                  className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100"
                  animate={{
                    background: [
                      "linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.3) 50%, transparent 70%)",
                      "linear-gradient(225deg, transparent 30%, rgba(255,255,255,0.3) 50%, transparent 70%)",
                    ],
                  }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                />

                <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--c-accent)] to-[var(--c-accent-2)] shadow-[0_0_20px_rgba(99,32,232,0.5)] md:h-10 md:w-10">
                  <span className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--c-text)] md:text-xl">S</span>
                </div>
              </motion.div>

              <div className="min-w-0 flex flex-col leading-none">
                {/* Character stagger text */}
                <div className="flex min-w-0 overflow-hidden">
                  {"Sixerbat".split("").map((char, i) => (
                    <motion.span
                      key={i}
                      className="bg-gradient-to-r from-[var(--c-text)] via-[var(--c-accent)] to-[var(--c-text)] bg-clip-text font-[family-name:var(--font-display)] text-sm font-semibold tracking-[-0.04em] text-transparent md:text-xl"
                      style={{
                        backgroundSize: "200% auto",
                        filter: "drop-shadow(0 0 8px rgba(99,32,232,0.5))",
                      }}
                      animate={{
                        backgroundPosition: ["0% center", "200% center"],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                      whileHover={{
                        y: -2,
                        scale: 1.1,
                        transition: { delay: i * 0.05 },
                      }}
                    >
                      {char}
                    </motion.span>
                  ))}
                </div>

                {/* Live indicator with user count */}
                <div className="hidden items-center gap-1.5 sm:flex">
                  <div className="relative flex items-center">
                    <motion.div
                      className="absolute h-2 w-2 rounded-full bg-[var(--c-success)]"
                      animate={{
                        scale: [1, 1.5, 1],
                        opacity: [1, 0, 1],
                      }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <div className="h-1.5 w-1.5 rounded-full bg-[var(--c-success)]" />
                  </div>
                  <span className="text-[9px] uppercase tracking-[0.2em] text-[var(--c-text-faint)]">
                    {userCount.toLocaleString()} Live
                  </span>
                </div>
              </div>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden flex-shrink-0 items-center gap-4 md:flex md:gap-6">
              <Link
                href="/matches"
                className="group relative whitespace-nowrap text-sm text-[var(--c-text-muted)] transition-colors hover:text-[var(--c-text)]"
              >
                <span className="absolute inset-0 -z-10 animate-pulse rounded-full bg-[color:var(--c-accent-glow)] opacity-0 blur-md group-hover:opacity-40" />
                Browse Matches
              </Link>
              {isAuthenticated ? (
                <>
                  <Link href={rolePath || "/profile"} className="group relative">
                    <span className="absolute inset-0 -z-10 animate-pulse rounded-full bg-[color:var(--c-accent-glow)] opacity-0 blur-md group-hover:opacity-50" />
                    <Button variant="secondary" className="text-sm">
                      Dashboard
                    </Button>
                  </Link>
                  <LogoutButton />
                </>
              ) : (
                <Link href="/login" className="group relative">
                  <span className="absolute inset-0 -z-10 animate-pulse rounded-full bg-[color:var(--c-accent-glow)] opacity-0 blur-md group-hover:opacity-50" />
                  <Button variant="primary" className="text-sm">
                    Login
                  </Button>
                </Link>
              )}
            </nav>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-[rgba(161,121,241,0.2)] text-[var(--c-text)] md:hidden"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        </div>
      </motion.header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-x-0 top-[60px] z-[59] px-3 md:hidden"
        >
          <div className="mx-auto w-full max-w-7xl rounded-2xl border border-[rgba(161,121,241,0.25)] bg-[rgba(20,18,38,0.95)] p-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-[20px]">
            <nav className="flex flex-col gap-3">
              <Link
                href="/matches"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-4 py-3 text-sm text-[var(--c-text-muted)] transition-colors hover:bg-[var(--c-accent-soft)] hover:text-[var(--c-text)]"
              >
                Browse Matches
              </Link>
              {isAuthenticated ? (
                <>
                  <Link
                    href={rolePath || "/profile"}
                    onClick={() => setMobileMenuOpen(false)}
                    className="rounded-lg border border-[var(--c-accent)] px-4 py-3 text-sm font-medium text-[var(--c-text)] transition-colors hover:bg-[var(--c-accent-soft)]"
                  >
                    Go to Dashboard
                  </Link>
                  <div onClick={() => setMobileMenuOpen(false)}>
                    <LogoutButton />
                  </div>
                </>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg bg-[var(--c-accent)] px-4 py-3 text-center text-sm font-medium text-[var(--c-text)] transition-colors hover:bg-[var(--c-accent-2)]"
                >
                  Login
                </Link>
              )}
            </nav>
          </div>
        </motion.div>
      )}
    </>
  );
}
