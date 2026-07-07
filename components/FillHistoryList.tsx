"use client";

import {
  listFillHistory,
  removeFillHistory,
  toggleFillImportant,
} from "@/lib/fill-history";
import { swallowAsync } from "@/lib/swallow-async";
import { Button, Card, Chip } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

export function FillHistoryList() {
  const router = useRouter();
  const [rows, setRows] = useState(() => listFillHistory());
  const [starsOnly, setStarsOnly] = useState(false);

  const refresh = useCallback(() => {
    setRows(listFillHistory());
  }, []);

  useEffect(() => {
    refresh();
    function onVis(): void {
      if (document.visibilityState === "visible") refresh();
    }
    function onCustom(): void {
      refresh();
    }
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("storage", refresh);
    window.addEventListener("teklif-fill-history", onCustom);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("teklif-fill-history", onCustom);
    };
  }, [refresh]);

  const visible = useMemo(
    () => (starsOnly ? rows.filter((e) => e.important) : rows),
    [rows, starsOnly],
  );

  if (rows.length === 0) {
    return (
      <Card.Root className="rounded-2xl border border-border/80 bg-surface-secondary/25">
        <Card.Content className="py-14 text-center text-sm text-muted">
          Henüz kayıtlı çıktı yok. Bir şablonu doldurup PDF veya Word indirdiğinizde
          burada görünür — veriler tarayıcınıza kaydedilir.
        </Card.Content>
      </Card.Root>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          Göster:
        </span>
        <Button
          size="sm"
          variant={!starsOnly ? "secondary" : "outline"}
          onPress={() => setStarsOnly(false)}
        >
          Tüm kayıtlar
        </Button>
        <Button
          size="sm"
          variant={starsOnly ? "secondary" : "outline"}
          onPress={() => setStarsOnly(true)}
        >
          Önemli olanlar
        </Button>
      </div>

      <ul className="space-y-2">
        {visible.length === 0 ? (
          <li className="rounded-xl border border-dashed border-border/50 px-4 py-6 text-center text-sm text-muted">
            Önemli olarak işaretli kayıt yok — listeden yıldıza dokunun.
          </li>
        ) : (
          visible.map((e) => {
            const dt = new Date(e.exportedAt).toLocaleString();
            return (
              <li key={e.id}>
                <Card.Root className="overflow-hidden rounded-xl border border-border/80 transition-colors hover:border-accent/35">
                  <Card.Content className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-foreground">
                          {e.templateName}
                        </span>
                        {e.important ? (
                          <Chip size="sm" variant="soft" color="warning">
                            Önemli
                          </Chip>
                        ) : null}
                        <Chip
                          size="sm"
                          variant="soft"
                          color={
                            e.format === "pdf" ? "accent" : "default"
                          }
                        >
                          {e.format === "pdf" ? "PDF" : "Word"}
                        </Chip>
                      </div>
                      <p className="text-xs text-muted">{dt}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onPress={() => {
                          toggleFillImportant(e.id);
                          refresh();
                        }}
                      >
                        {e.important ? "Önem kaldır" : "Önemli yap"}
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        onPress={() =>
                          swallowAsync(() =>
                            router.push(
                              `/gecmis-doldurmalar/${encodeURIComponent(e.id)}`,
                            ),
                          )
                        }
                      >
                        Aç
                      </Button>
                      <Button
                        size="sm"
                        variant="danger-soft"
                        onPress={() => {
                          removeFillHistory(e.id);
                          refresh();
                        }}
                      >
                        Sil
                      </Button>
                    </div>
                  </Card.Content>
                </Card.Root>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
