"use client";

import { TemplateFill } from "@/components/TemplateFill";
import { FillHistoryTextsOnly } from "@/components/FillHistoryTextsOnly";
import {
  getFillHistory,
  updateFillHistory,
  toggleFillImportant,
} from "@/lib/fill-history";
import type { StoredTemplate } from "@/lib/stored-template";
import { swallowAsync } from "@/lib/swallow-async";
import { Button, Chip, Spinner } from "@heroui/react";
import {
  ExternalLink,
  ListOrdered,
  PencilLine,
  Save,
  Star,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function FillHistoryDetail({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [entry, setEntry] = useState(() => getFillHistory(entryId));
  const [tpl, setTpl] = useState<StoredTemplate | null>(null);
  const [tplLoading, setTplLoading] = useState(true);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);

  const editingRef = useRef(false);

  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  const loadEntryFromStore = useCallback((): void => {
    const e = getFillHistory(entryId);
    setEntry(e ?? null);
    if (e && !editingRef.current) {
      setDraftValues({ ...e.values });
    }
  }, [entryId]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setEditing(false);
    loadEntryFromStore();
  }, [entryId, loadEntryFromStore]);

  useEffect(() => {
    window.addEventListener("teklif-fill-history", loadEntryFromStore);
    return (): void =>
      window.removeEventListener(
        "teklif-fill-history",
        loadEntryFromStore as EventListener,
      );
  }, [loadEntryFromStore]);

  useEffect(() => {
    if (!entry) {
      setTpl(null);
      setTplLoading(false);
      return;
    }
    let cancel = false;
    setTplLoading(true);
    void (async (): Promise<void> => {
      const r = await fetch(
        `/api/templates/${encodeURIComponent(entry.templateId)}`,
      );
      if (cancel) return;
      if (r.ok) {
        const j = (await r.json()) as StoredTemplate;
        setTpl(j);
      } else {
        setTpl(null);
      }
      setTplLoading(false);
    })();
    return (): void => {
      cancel = true;
    };
  }, [entry?.templateId, entry]);

  const tplKey = useMemo(() => {
    if (!tpl) return "";
    return `${tpl.id}-${tpl.updatedAt}`;
  }, [tpl]);

  const onSave = useCallback((): void => {
    const e = getFillHistory(entryId);
    if (!e) return;
    const nx = updateFillHistory(e.id, {
      values: { ...draftValues },
      modifiedAt: new Date().toISOString(),
    });
    if (nx) {
      setEntry(nx);
      setDraftValues({ ...nx.values });
    }
    setEditing(false);
  }, [entryId, draftValues]);

  const onCancelEdit = useCallback((): void => {
    setEditing(false);
    const e = getFillHistory(entryId);
    if (e) setDraftValues({ ...e.values });
  }, [entryId]);

  const onToggleImportant = useCallback((): void => {
    toggleFillImportant(entryId);
    loadEntryFromStore();
  }, [entryId, loadEntryFromStore]);

  if (!mounted) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted">
        <Spinner size="sm" /> Yükleniyor…
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">Bu kayıt bulunamadı.</p>
        <Button
          variant="outline"
          onPress={() =>
            swallowAsync(() => router.push("/gecmis-doldurmalar"))
          }
        >
          Geçmiş listesine dön
        </Button>
      </div>
    );
  }

  const at = new Date(entry.exportedAt).toLocaleString();
  const modAt =
    entry.modifiedAt &&
    entry.modifiedAt !== entry.exportedAt
      ? new Date(entry.modifiedAt).toLocaleString()
      : null;

  return (
    <div className="space-y-6">
      {/* Üst başlık — tek satırda liste dönüşü */}
      <div className="flex flex-col gap-3 border-b border-border/35 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Kayıt
            </span>
            <span className="text-xs text-muted">Çıktı: {at}</span>
            {modAt ? (
              <span className="text-xs text-muted/90">
                · Güncellenme: {modAt}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 max-w-[min(100%,48rem)] text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {entry.templateName}
            </h1>
            {entry.important ? (
              <Chip size="sm" variant="soft" color="warning">
                Önemli
              </Chip>
            ) : null}
            <Chip
              size="sm"
              variant="soft"
              color={entry.format === "pdf" ? "accent" : "default"}
            >
              {entry.format === "pdf" ? "PDF" : "Word"}
            </Chip>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 self-start gap-2"
          onPress={() =>
            swallowAsync(() => router.push("/gecmis-doldurmalar"))
          }
        >
          <ListOrdered className="size-[1rem] shrink-0 opacity-80" aria-hidden />
          Geçmişe dön
        </Button>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_min(360px,max(288px,calc((100vw-2rem)*0.32)))] 2xl:gap-10">
        {/* Sol: önizleme */}
        <div className="min-w-0">
          {tplLoading ? (
            <div className="flex items-center gap-2 py-12 text-sm text-muted">
              <Spinner size="sm" /> Şablon yükleniyor…
            </div>
          ) : tpl ? (
            <TemplateFill
              key={`hist-${tplKey}-${entry.id}`}
              template={tpl}
              readOnly={!editing}
              allowExportWhenReadOnly
              suppressHistoryPush
              controlledValues={draftValues}
              onControlledValuesChange={setDraftValues}
              previewOnly
            />
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
                Şablon bu bilgisayardaki projede bulunamadı; kayıtta tutulan
                metinleri aşağıda görebilirsiniz.
              </div>
              <FillHistoryTextsOnly entry={entry} />
            </div>
          )}
        </div>

        {/* Sağ: vurgulu işlem paneli */}
        <aside className="min-w-0 xl:sticky xl:top-[calc(7rem)] xl:self-start">
          <div
            className="relative overflow-hidden rounded-2xl border border-accent/35 bg-gradient-to-br from-accent/[0.12] via-surface-secondary/90 to-muted/40 p-[1px] shadow-lg shadow-accent/10 ring-1 ring-white/[0.06]"
            aria-label="Kayıt işlemleri"
          >
            <div className="rounded-[0.935rem] border border-white/10 bg-background/95 px-5 py-5 backdrop-blur-sm">
              <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
                İşlemler
              </p>

              {/* Önem */}
              <div className="mb-6 rounded-xl border border-border/55 bg-muted/25 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Star
                    className={`size-4 shrink-0 ${entry.important ? "fill-amber-400 text-amber-500" : "opacity-65"}`}
                    aria-hidden
                  />
                  Önem sırası
                </div>
                <p className="mb-4 text-[12px] leading-relaxed text-muted">
                  Liste ve filtrelerde öne çıkarmak için işaretleyin.
                </p>
                <Button
                  variant={entry.important ? "secondary" : "primary"}
                  className="h-11 w-full justify-start gap-2 font-medium"
                  onPress={onToggleImportant}
                >
                  <Star
                    className="size-4 shrink-0 opacity-95"
                    aria-hidden
                  />
                  {entry.important
                    ? "Önem işaretini kaldır"
                    : "Önemli olarak işaretle"}
                </Button>
              </div>

              {/* Şablon varken: düzenle + canlı */}
              {tpl ? (
                <>
                  {!editing ? (
                    <div className="mb-5">
                      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                        <PencilLine
                          className="size-4 shrink-0 text-accent"
                          aria-hidden
                        />
                        Metin düzenleme
                      </p>
                      <p className="mb-4 text-[12px] leading-relaxed text-muted">
                        Kutulardaki metinleri güncelleyip kaydedin; çıktıyı
                        önizlemenin altındaki çıktı bölümünden tekrar alın.
                      </p>
                      <Button
                        variant="primary"
                        className="h-11 w-full gap-2 font-semibold shadow-md shadow-accent/25"
                        onPress={() => setEditing(true)}
                      >
                        <PencilLine className="size-4 shrink-0" aria-hidden />
                        Metinleri düzenle
                      </Button>
                    </div>
                  ) : (
                    <div className="mb-5 rounded-xl border border-emerald-500/35 bg-emerald-500/[0.08] p-4">
                      <p className="mb-3 text-[12px] font-medium text-foreground">
                        Düzenleme modunda
                      </p>
                      <div className="flex flex-col gap-2">
                        <Button
                          variant="primary"
                          className="h-11 w-full gap-2 font-semibold"
                          onPress={onSave}
                        >
                          <Save className="size-4 shrink-0" aria-hidden />
                          Kaydet
                        </Button>
                        <Button
                          variant="outline"
                          className="h-10 w-full gap-2"
                          onPress={onCancelEdit}
                        >
                          <X className="size-4 shrink-0" aria-hidden />
                          İptal
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl border border-border/55 bg-muted/20 p-4">
                    <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                      <ExternalLink
                        className="size-4 shrink-0 text-accent"
                        aria-hidden
                      />
                      Canlı şablon
                    </p>
                    <p className="mb-4 text-[12px] leading-relaxed text-muted">
                      Tam doldurma sayfasına geçerek sıfırdan veya yeni çıktı
                      üretin.
                    </p>
                    <Button
                      variant="secondary"
                      className="h-11 w-full gap-2 font-medium ring-1 ring-accent/35"
                      onPress={() =>
                        swallowAsync(() =>
                          router.push(`/fill/${encodeURIComponent(tpl.id)}`),
                        )
                      }
                    >
                      <ExternalLink className="size-4 shrink-0" aria-hidden />
                      Canlı doldurmayı aç
                    </Button>
                  </div>
                </>
              ) : !tplLoading ? (
                <p className="text-[12px] leading-relaxed text-muted">
                  Şablon bu projede yok; yalnızca kaydedilmiş metinler
                  görüntülenir — canlı düzenleme kapalıdır.
                </p>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
