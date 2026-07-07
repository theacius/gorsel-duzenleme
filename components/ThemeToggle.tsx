"use client";

import { Button } from "@heroui/react";
import { Moon, Sun } from "lucide-react";
import type { ReactElement } from "react";
import { useCallback, useSyncExternalStore } from "react";

function snapshotDark(): boolean {
  if (typeof document === "undefined") return true;
  return document.documentElement.classList.contains("dark");
}

function subscribe(cb: () => void): () => void {
  const observer = new MutationObserver(() => cb());
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return (): void => observer.disconnect();
}

/** Tarayıcı: `localStorage['teklif-theme'] = 'dark' | 'light'`, `document.documentElement` sınıfları. */
export function ThemeToggle(): ReactElement {
  const isDark = useSyncExternalStore(
    subscribe,
    snapshotDark,
    () => true,
  );

  const TRANSITION_MS = 450;

  const toggle = useCallback((): void => {
    const root = document.documentElement;
    root.classList.add("theme-transition-enable");
    const next = !snapshotDark();
    requestAnimationFrame(() => {
      root.classList.toggle("dark", next);
      try {
        localStorage.setItem("teklif-theme", next ? "dark" : "light");
      } catch {
        /* ignore */
      }
    });
    window.setTimeout(() => {
      root.classList.remove("theme-transition-enable");
    }, TRANSITION_MS);
  }, []);

  return (
    <Button
      size="sm"
      variant="outline"
      type="button"
      isIconOnly
      className="border-border/90"
      aria-pressed={isDark}
      aria-label={isDark ? "Aydınlık temaya geç" : "Karanlık temaya geç"}
      onPress={toggle}
    >
      {isDark ? (
        <Sun className="size-[1.125rem]" strokeWidth={2} aria-hidden />
      ) : (
        <Moon className="size-[1.125rem]" strokeWidth={2} aria-hidden />
      )}
    </Button>
  );
}
