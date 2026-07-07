"use client";

import { type ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { swallowAsync } from "@/lib/swallow-async";
import { Button } from "@heroui/react";
import { History, LogOut } from "lucide-react";

import { ThemeToggle } from "@/components/ThemeToggle";

type MainShellProps = {
  children: ReactNode;
  /** Minimal header (no sticky nav chrome) — e.g. secondary panels */
  slim?: boolean;
  /** Doldurma vb. geniş önizleme sayfaları — max genişlik yükseltilir */
  wide?: boolean;
};

export function MainShell({ children, slim, wide }: MainShellProps) {
  const router = useRouter();
  const [showLogout, setShowLogout] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/status", { credentials: "include" })
      .then((r) => r.json() as Promise<{ locked?: boolean; unlocked?: boolean }>)
      .then((j) => setShowLogout(Boolean(j.locked && j.unlocked)))
      .catch(() => setShowLogout(false));
  }, []);

  return (
    <main className="relative min-h-screen">
      {!slim && (
        <header className="sticky top-0 z-40 border-b border-border/35 bg-background/78 backdrop-blur-xl backdrop-saturate-150">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/35 to-transparent" />
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:gap-6">
            <Link
              href="/"
              className="group min-w-0 rounded-lg outline-none ring-offset-2 ring-offset-background transition-colors focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="block truncate text-base font-semibold tracking-tight text-foreground">
                Görsel Şablon
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-muted opacity-90 transition-opacity group-hover:opacity-100">
                Yerel şablon motoru
              </span>
            </Link>
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              <Button
                size="sm"
                variant="outline"
                className="border-border/90"
                isIconOnly
                aria-label="Geçmiş"
                onPress={() =>
                  swallowAsync(() => router.push("/gecmis-doldurmalar"))
                }
              >
                <History className="size-[1.125rem]" strokeWidth={2} aria-hidden />
              </Button>
              {showLogout ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-border/90"
                  aria-label="Oturumu kapat"
                  onPress={() =>
                    swallowAsync(async () => {
                      await fetch("/api/auth/logout", {
                        method: "POST",
                        credentials: "include",
                      });
                      router.push("/unlock");
                      router.refresh();
                    })
                  }
                >
                  <LogOut className="size-[1rem]" strokeWidth={2} aria-hidden />
                  Oturumu kapat
                </Button>
              ) : null}
              <ThemeToggle />
              <Button
                size="sm"
                variant="primary"
                className="shadow-md shadow-accent/25"
                onPress={() =>
                  swallowAsync(() => router.push("/studio/new"))
                }
              >
                Yeni şablon
              </Button>
            </div>
          </div>
        </header>
      )}

      <div
        className={
          slim
            ? "min-h-screen p-4 pb-24"
            : wide
              ? "mx-auto max-w-[min(100%,88rem)] space-y-8 px-4 py-8 pb-28 sm:px-5"
              : "mx-auto max-w-6xl space-y-8 px-4 py-8 pb-28 sm:px-5"
        }
      >
        {children}
      </div>
    </main>
  );
}
