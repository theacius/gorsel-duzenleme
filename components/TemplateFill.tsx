"use client";

import { FieldOverlayInput } from "@/components/FieldOverlay";
import { TemplateImageShell } from "@/components/TemplateImageShell";
import {
  fieldBoxGeometryStyle,
  fieldPlacementBoxPct,
} from "@/lib/overlay-geometry";
import { effectiveImageCornerRadiusPx } from "@/lib/image-field-styles";
import {
  downloadFillPdf,
  downloadFillWord,
  sanitizeFileBase,
  type FillCanvasFieldSnapshot,
} from "@/lib/fill-export";
import { isTypingTarget } from "@/lib/dom-target";
import {
  canonicalHexForColorInput,
  emptyValuesFor,
  imageObjectFitTailwindClass,
  isImageKind,
  migrateFieldsList,
  type TeklifField,
} from "@/lib/teklif-fields";
import { useDialogs } from "@/components/MessageDialogs";
import type { StoredTemplate } from "@/lib/stored-template";
import { useShellSize } from "@/hooks/use-shell-size";
import { swallowAsync } from "@/lib/swallow-async";
import { pushFillHistory } from "@/lib/fill-history";
import { Button, Chip, Spinner } from "@heroui/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function TemplateFill({
  template,
  readOnly = false,
  initialValues,
  allowExportWhenReadOnly = false,
  suppressHistoryPush = false,
  controlledValues,
  onControlledValuesChange,
  previewOnly = false,
}: {
  template: StoredTemplate;
  /** Geçmiş görünümü — alanlar düzenlenemez, çıktı araçları kapalı */
  readOnly?: boolean;
  /** Önceden doldurulmuş metinler (ör. geçmiş kayıt) */
  initialValues?: Record<string, string>;
  /** Salt okunur görünümde bile PDF/Word (geçmiş tekrar indirme vb.) */
  allowExportWhenReadOnly?: boolean;
  /** Çıktı sonrasında `pushFillHistory` çağrılmasın */
  suppressHistoryPush?: boolean;
  /** Üst bileşenden kontrol — geçmiş kayıt düzenleme */
  controlledValues?: Record<string, string>;
  onControlledValuesChange?: (next: Record<string, string>) => void;
  /** Geçmiş detay: yalnızca önizleme — sağ sütun kapalı */
  previewOnly?: boolean;
}) {
  const captureShellRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(100);
  const [zoomPct, setZoomPct] = useState(100);
  const shell = useShellSize(captureShellRef);
  const [exportBusy, setExportBusy] = useState<null | "pdf" | "word">(null);

  const { DialogOutlet, alert: dlgAlert } = useDialogs();

  const viewportZoom = clamp(zoomPct, 25, 400) / 100;

  useEffect(() => {
    zoomRef.current = zoomPct;
  }, [zoomPct]);

  useEffect(() => {
    setZoomPct(100);
    zoomRef.current = 100;
  }, [template.id]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor =
        e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 320 : 1;
      const dy = e.deltaY * factor;
      const zOld = zoomRef.current;
      const zNew = Math.round(clamp(zOld - dy * 0.08, 25, 400));
      if (zNew === zOld) return;

      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const sl = el.scrollLeft;
      const st = el.scrollTop;
      const s0 = zOld / 100;
      const s1 = zNew / 100;

      zoomRef.current = zNew;
      setZoomPct(zNew);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          let nsx = (sl + mx) * (s1 / s0) - mx;
          let nsy = (st + my) * (s1 / s0) - my;
          const maxX = Math.max(0, el.scrollWidth - el.clientWidth);
          const maxY = Math.max(0, el.scrollHeight - el.clientHeight);
          nsx = clamp(nsx, 0, maxX);
          nsy = clamp(nsy, 0, maxY);
          el.scrollLeft = nsx;
          el.scrollTop = nsy;
        });
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const fields = useMemo(
    () => migrateFieldsList(template.fields),
    [template],
  );

  const mergedEmpty = useMemo(() => emptyValuesFor(fields), [fields]);

  const isControlled = typeof onControlledValuesChange === "function";

  const [internalValues, setInternalValues] = useState(() => {
    const base = emptyValuesFor(migrateFieldsList(template.fields));
    return initialValues ? { ...base, ...initialValues } : base;
  });

  const values = useMemo((): Record<string, string> => {
    return isControlled
      ? { ...mergedEmpty, ...(controlledValues ?? {}) }
      : internalValues;
  }, [isControlled, mergedEmpty, controlledValues, internalValues]);

  /** Şablon değişince (bağlı bileşende key kullanılsa da güvenilir) iç state senkronu */
  useEffect(() => {
    if (isControlled) return;
    const n = initialValues ? { ...mergedEmpty, ...initialValues } : { ...mergedEmpty };
    setInternalValues(n);
  }, [template.id, template.updatedAt, mergedEmpty, initialValues, isControlled]);

  const setFieldText = useCallback(
    (fieldId: string, value: string): void => {
      if (!isControlled) {
        setInternalValues((pv) => ({ ...pv, [fieldId]: value }));
        return;
      }
      const next = {
        ...mergedEmpty,
        ...(controlledValues ?? {}),
        [fieldId]: value,
      };
      onControlledValuesChange!(next);
    },
    [isControlled, mergedEmpty, controlledValues, onControlledValuesChange],
  );

  const resetTexts = useCallback((): void => {
    const blank = { ...mergedEmpty };
    if (isControlled) {
      onControlledValuesChange!(blank);
    } else {
      setInternalValues(blank);
    }
  }, [mergedEmpty, isControlled, onControlledValuesChange]);

  const runExport = useCallback(
    async (kind: "pdf" | "word") => {
      if (readOnly && !allowExportWhenReadOnly) return;
      flushSync(() => {
        setExportBusy(kind);
      });
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });
      try {
        const base = sanitizeFileBase(template.name);
        const snapshots: FillCanvasFieldSnapshot[] = fields
          .filter((f) => !isImageKind(f))
          .map((f) => ({
            id: f.id,
            value: values[f.id] ?? "",
            colorHex: canonicalHexForColorInput(f.textStyle.color),
          }));
        if (kind === "pdf") {
          await downloadFillPdf({
            template,
            fields,
            snapshots,
            shellWpx: shell.width,
            shellHpx: shell.height,
            fileBase: base,
          });
        } else {
          await downloadFillWord({
            template,
            fields,
            snapshots,
            shellWpx: shell.width,
            shellHpx: shell.height,
            fileBase: base,
          });
        }
        if (!suppressHistoryPush) {
          pushFillHistory({
          templateId: template.id,
          templateName: template.name,
          format: kind,
          values: { ...values },
          fieldsMeta: fields.map((f) => ({
            id: f.id,
            label: f.label || "",
          })),
        });
        }
      } catch {
        await dlgAlert(
          "Çıktı oluşturulamadı",
          "PDF veya Word üretilirken bir hata oluştu. Tekrar deneyin; sorun sürerse sayfayı yenileyin veya farklı bir tarayıcı kullanın.",
        );
      } finally {
        flushSync(() => {
          setExportBusy(null);
        });
      }
    },
    [
      readOnly,
      allowExportWhenReadOnly,
      suppressHistoryPush,
      template,
      fields,
      values,
      dlgAlert,
      shell.width,
      shell.height,
    ],
  );

  const runExportRef = useRef(runExport);
  runExportRef.current = runExport;

  const exportPdfBtnRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const typing = isTypingTarget(e.target);
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.altKey || (readOnly && !allowExportWhenReadOnly)) return;

      const k = e.key.toLowerCase();

      if (k === "e" && !e.shiftKey) {
        if (typing) return;
        const el = exportPdfBtnRef.current;
        if (
          el &&
          typeof (el as { focus?: () => void }).focus === "function"
        )
          (el as { focus: () => void }).focus();
        e.preventDefault();
        return;
      }

      if (!e.shiftKey) return;

      if (k === "p") {
        if (typing) return;
        e.preventDefault();
        swallowAsync(() => runExportRef.current("pdf"));
        return;
      }
      if (k === "w") {
        if (typing) return;
        e.preventDefault();
        swallowAsync(() => runExportRef.current("word"));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readOnly, allowExportWhenReadOnly]);

  const busyPdf = exportBusy === "pdf";
  const busyWord = exportBusy === "word";

  const CANVAS_PREVIEW_PAD_PX = 32;
  const previewMinPx = useMemo(() => {
    return {
      w: Math.ceil(shell.width + CANVAS_PREVIEW_PAD_PX),
      h: Math.ceil(shell.height + CANVAS_PREVIEW_PAD_PX),
    };
  }, [shell]);

  const bumpZoom = useCallback((delta: number): void => {
    setZoomPct((z) => Math.round(clamp(z + delta, 25, 400)));
  }, []);

  const showExportPanel =
    !readOnly || allowExportWhenReadOnly;

  const previewOnlyMode = previewOnly === true;

  const layoutRootClass = previewOnlyMode
    ? "w-full space-y-0"
    : "grid gap-8 xl:grid-cols-[minmax(0,1fr)_17.5rem] xl:items-start 2xl:gap-10";

  const zoomControlsPanel = (
    <div className="rounded-2xl border border-border/40 bg-surface-secondary/40 p-4 shadow-sm shadow-black/10">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
        Önizleme yakınlığı
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          isIconOnly
          aria-label="Uzaklaştır"
          onPress={() => bumpZoom(-12)}
        >
          −
        </Button>
        <span className="min-w-[3.25rem] tabular-nums text-center text-sm font-medium text-foreground">
          {Math.round(clamp(zoomPct, 25, 400))}%
        </span>
        <Button
          size="sm"
          variant="outline"
          isIconOnly
          aria-label="Yakınlaştır"
          onPress={() => bumpZoom(12)}
        >
          +
        </Button>
        <Button size="sm" variant="secondary" onPress={() => setZoomPct(100)}>
          %100
        </Button>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        {readOnly
          ? "Salt okunur önizleme — tekerlek ile de yakınlaştırabilirsiniz."
          : "Tekerlek ile de ayarlanır. PDF/Word çıktısı bu orandan etkilenmez."}
      </p>
      {!readOnly ? (
        <p className="mt-2 text-[11px] leading-relaxed text-muted/90">
          <kbd className="rounded border border-border/50 bg-background/80 px-1 py-0.5 font-mono text-[10px]">
            Ctrl+Shift+P
          </kbd>{" "}
          PDF ·{" "}
          <kbd className="rounded border border-border/50 bg-background/80 px-1 py-0.5 font-mono text-[10px]">
            Ctrl+Shift+W
          </kbd>{" "}
          Word
        </p>
      ) : null}
    </div>
  );

  const exportBlockedNotice =
    readOnly && !allowExportWhenReadOnly ? (
      <div
        className="rounded-2xl border border-dashed border-border/55 bg-muted/10 px-4 py-3 text-xs leading-relaxed text-muted"
        role="status"
      >
        Kayıtta alan düzenlemesi yapılamaz — bu görünümde çıktı da yoktur.
      </div>
    ) : null;

  const exportOutputPanel = showExportPanel ? (
    <div
      role="toolbar"
      aria-label="Dışa aktarma"
      className="flex flex-col gap-2 rounded-2xl border border-border/40 bg-surface-secondary/50 p-4 shadow-sm shadow-black/10"
    >
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
        Çıktı
      </p>
      <Button
        ref={(node) => {
          exportPdfBtnRef.current = node as unknown as HTMLElement | null;
        }}
        variant="primary"
        isDisabled={!!exportBusy}
        className="w-full justify-center"
        onPress={() => swallowAsync(() => runExport("pdf"))}
      >
        {busyPdf ? (
          <span className="inline-flex items-center gap-2">
            <Spinner size="sm" /> PDF hazırlanıyor…
          </span>
        ) : (
          suppressHistoryPush ? "PDF indir (yeniden)" : "PDF indir"
        )}
      </Button>
      <Button
        variant="outline"
        isDisabled={!!exportBusy}
        className="w-full justify-center"
        onPress={() => swallowAsync(() => runExport("word"))}
      >
        {busyWord ? (
          <span className="inline-flex items-center gap-2">
            <Spinner size="sm" /> Word hazırlanıyor…
          </span>
        ) : suppressHistoryPush ? (
          "Word indir (yeniden)"
        ) : (
          "Word indir"
        )}
      </Button>
      {!readOnly ? (
        <Button
          variant="outline"
          isDisabled={!!exportBusy}
          className="w-full justify-center"
          onPress={() => resetTexts()}
        >
          Metinleri sıfırla
        </Button>
      ) : null}
    </div>
  ) : null;

  const previewOnlyChrome = previewOnlyMode ? (
    <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-4">
      <div className="min-w-0 flex-1 sm:max-w-md">{zoomControlsPanel}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-4 sm:max-w-md">
        {exportBlockedNotice}
        {exportOutputPanel}
      </div>
    </div>
  ) : null;

  const asideBlock =
    previewOnlyMode ? null : (
      <>
        {/* Sağ sütun: alanlar + yakınlık + çıktı */}
        <aside className="flex min-w-0 flex-col gap-5 xl:sticky xl:top-28 xl:self-start">
          {fields.length > 0 ? (
            <div className="rounded-2xl border border-border/40 bg-surface-secondary/40 p-4 shadow-sm shadow-black/10">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                {readOnly ? "Kayıttaki alanlar" : "Alanlar"}
              </p>
              <div className="max-h-56 overflow-y-auto pr-1 sm:max-h-64">
                <div className="flex flex-wrap gap-2">
                  {fields.map((f) => (
                    <Chip
                      key={f.id}
                      size="sm"
                      variant={readOnly ? "tertiary" : "secondary"}
                    >
                      <span className="max-w-[12rem] truncate">
                        {(f.label || "Etiketsiz") +
                          " · " +
                          (isImageKind(f) ? "Görsel" : "Metin")}
                      </span>
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {zoomControlsPanel}
          {exportBlockedNotice}
          {exportOutputPanel}
        </aside>
      </>
    );

  return (
    <>
      <DialogOutlet />
    <div className={layoutRootClass}>
      {/* Bellek + önizleme */}
      <div className="min-w-0 space-y-4">
        <div
          className="rounded-2xl border border-border/40 bg-gradient-to-b from-surface-secondary/40 to-muted/15 p-1 shadow-inner shadow-black/10 ring-1 ring-white/[0.04]"
          style={{
            minWidth: previewMinPx.w,
            minHeight: previewMinPx.h,
          }}
        >
          <div
            className="overflow-hidden rounded-[0.875rem] border border-white/10 bg-white ring-1 ring-black/15"
          >
            <div
              ref={viewportRef}
              tabIndex={0}
              className="max-h-[min(680px,calc(100vh-22rem))] w-full overflow-auto rounded-[inherit] bg-white outline-none focus-visible:ring-2 focus-visible:ring-accent/35 xl:max-h-[min(78vh,calc(100dvh-12rem))]"
              aria-label={
                readOnly
                  ? "Geçmiş form önizlemesi — tekerlek ile yakınlaştır"
                  : "Form önizleme — tekerlek ile yakınlaştır"
              }
            >
              <div
                className="inline-block min-w-max"
                style={{
                  width:
                    (shell.width + CANVAS_PREVIEW_PAD_PX) * viewportZoom,
                  minHeight:
                    (shell.height + CANVAS_PREVIEW_PAD_PX) * viewportZoom,
                }}
              >
                <div
                  className="inline-block min-w-max origin-top-left leading-none"
                  style={{
                    transform: exportBusy
                      ? "scale(1)"
                      : `scale(${viewportZoom})`,
                    transformOrigin: "top left",
                  }}
                >
                  <div className="inline-block min-w-max p-4">
                    <TemplateImageShell
                      ref={captureShellRef}
                      src={template.backgroundDataUrl}
                      alt=""
                      className="max-w-full"
                    >
                      {fields.map((field, zIdx) =>
                        isImageKind(field) ? (
                          <div
                            key={field.id}
                            className="pointer-events-none box-border overflow-hidden"
                            style={{
                              ...fieldBoxGeometryStyle(
                                fieldPlacementBoxPct(
                                  field,
                                  shell.width,
                                  shell.height,
                                ),
                              ),
                              borderRadius: `${effectiveImageCornerRadiusPx(field, shell.width, shell.height)}px`,
                              zIndex: 30 + zIdx,
                            }}
                            aria-hidden
                          >
                            {field.imageDataUrl &&
                            field.imageDataUrl.length > 8 ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={field.imageDataUrl}
                                alt=""
                                className={`h-full w-full select-none ${imageObjectFitTailwindClass(field.imageObjectFit)}`}
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center bg-neutral-950/35 px-1 text-center text-[10px] leading-snug text-white/85">
                                Görsel yok
                              </span>
                            )}
                          </div>
                        ) : (
                          <FieldOverlayInput
                            key={field.id}
                            field={field}
                            shellW={shell.width}
                            shellH={shell.height}
                            readOnly={readOnly}
                            value={values[field.id] ?? ""}
                            onChange={
                              readOnly
                                ? () => {}
                                : (v) => setFieldText(field.id, v)
                            }
                          />
                        ),
                      )}
                    </TemplateImageShell>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {previewOnlyChrome}
      </div>

      {asideBlock}
    </div>
    </>
  );
}
