"use client";

import { TemplateImageShell } from "@/components/TemplateImageShell";
import {
  magnetMoveImage,
  magnetMoveText,
  magnetResizeTextWidth,
  magnetSnapImageResizeBox,
  snapAxesForTextBands,
} from "@/lib/field-snap";
import type { ImageResizeMagnetEdge } from "@/lib/field-snap";
import { effectiveImageCornerRadiusPx } from "@/lib/image-field-styles";
import { fieldBoxGeometryStyle, fieldPlacementBoxPct } from "@/lib/overlay-geometry";
import {
  clampBox,
  fieldTextStyleCss,
  imageObjectFitTailwindClass,
  isImageKind,
  quantizeBoxPrecision,
  textBandHeightPctForShell,
  type TeklifField,
} from "@/lib/teklif-fields";
import type { MagnetSettings } from "@/lib/snap-settings";
import { useShellSize } from "@/hooks/use-shell-size";
import {
  readShellSnapRectForPointer,
  type ShellRectSnap,
} from "@/lib/template-measure";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

const MOVE_PX_THRESHOLD = 6;

/** Aynı shell ölçüsü ile piksel → %; böylece sürüklemede fare 1:1 hissedilir. */
function clientToPct(
  clientX: number,
  clientY: number,
  rect: ShellRectSnap,
): { x: number; y: number } {
  return {
    x: ((clientX - rect.left) / rect.width) * 100,
    y: ((clientY - rect.top) / rect.height) * 100,
  };
}

type PendingMove = {
  id: string;
  startPointerPct: { x: number; y: number };
  startBox: TeklifField["box"];
  startClientX: number;
  startClientY: number;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/** Görsel kutu yeniden boyutlandır — kenar/köşe (dx, dy % olarak kabuğa göre) */
type ImageResizeEdge =
  | "n"
  | "e"
  | "s"
  | "w"
  | "ne"
  | "se"
  | "sw"
  | "nw";

function applyImageBoxResize(
  b: TeklifField["box"],
  edge: ImageResizeEdge,
  dx: number,
  dy: number,
): TeklifField["box"] {
  const minW = 0.8;
  const minH = 1.1;
  const R = b.left + b.width;
  const B = b.top + b.height;

  let left = b.left;
  let top = b.top;
  let width = b.width;
  let height = b.height;

  switch (edge) {
    case "e":
      width = clamp(b.width + dx, minW, 100 - b.left);
      break;
    case "w": {
      const nl = clamp(b.left + dx, 0, R - minW);
      width = R - nl;
      left = nl;
      break;
    }
    case "s":
      height = clamp(b.height + dy, minH, 100 - b.top);
      break;
    case "n": {
      const nt = clamp(b.top + dy, 0, B - minH);
      height = B - nt;
      top = nt;
      break;
    }
    case "se":
      width = clamp(b.width + dx, minW, 100 - b.left);
      height = clamp(b.height + dy, minH, 100 - b.top);
      break;
    case "sw": {
      const nl = clamp(b.left + dx, 0, R - minW);
      width = R - nl;
      left = nl;
      height = clamp(b.height + dy, minH, 100 - b.top);
      break;
    }
    case "ne":
      width = clamp(b.width + dx, minW, 100 - b.left);
      {
        const nt = clamp(b.top + dy, 0, B - minH);
        height = B - nt;
        top = nt;
      }
      break;
    case "nw": {
      const nl = clamp(b.left + dx, 0, R - minW);
      width = R - nl;
      left = nl;
      const nt = clamp(b.top + dy, 0, B - minH);
      height = B - nt;
      top = nt;
      break;
    }
    default:
      break;
  }

  return clampBox(quantizeBoxPrecision({ left, top, width, height }));
}

type DragState = {
  kind: "move" | "resize";
  id: string;
  startPointerPct: { x: number; y: number };
  startBox: TeklifField["box"];
  /** Görsel alan yeniden boyutlandırma — `resize` + görsel */
  imageResizeEdge?: ImageResizeEdge;
};

function mergeCommittedBoxPartial(
  f: TeklifField,
  nextBoxPatch: TeklifField["box"],
  shellHPx: number,
): TeklifField["box"] {
  if (isImageKind(f)) {
    return clampBox(quantizeBoxPrecision({ ...nextBoxPatch }));
  }
  const provisional: TeklifField = {
    ...f,
    box: { ...nextBoxPatch },
  };
  provisional.box.height = textBandHeightPctForShell(shellHPx, provisional);
  return clampBox(quantizeBoxPrecision(provisional.box));
}

export function TemplateEditor({
  backgroundDataUrl,
  fields,
  onChange,
  selectedId,
  onSelect,
  magnetSettings,
  onMagnetSettingsChange,
}: {
  backgroundDataUrl: string;
  fields: TeklifField[];
  onChange: (next: TeklifField[]) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  magnetSettings: MagnetSettings;
  onMagnetSettingsChange: Dispatch<SetStateAction<MagnetSettings>>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const interactionShellRectRef = useRef<ShellRectSnap | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  const ssRef = useRef<MagnetSettings>(magnetSettings);
  ssRef.current = magnetSettings;

  const [drag, setDrag] = useState<DragState | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [zoomPct, setZoomPct] = useState(100);
  const zoomRef = useRef(100);

  const panRef = useRef<{
    startX: number;
    startY: number;
    scrollL: number;
    scrollT: number;
  } | null>(null);

  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [snapGuides, setSnapGuides] = useState<{
    xv: number[];
    yv: number[];
  } | null>(null);

  const viewportZoom = clamp(zoomPct, 25, 400) / 100;

  const shellSize = useShellSize(wrapRef);

  useEffect(() => {
    setZoomPct(100);
    zoomRef.current = 100;
  }, [backgroundDataUrl]);

  useEffect(() => {
    zoomRef.current = zoomPct;
  }, [zoomPct]);

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

  useEffect(() => {
    if (!pendingMove) return;
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - pendingMove.startClientX;
      const dy = e.clientY - pendingMove.startClientY;
      if (Math.hypot(dx, dy) < MOVE_PX_THRESHOLD) return;
      setEditingLabelId(null);
      setDrag({
        kind: "move",
        id: pendingMove.id,
        startPointerPct: pendingMove.startPointerPct,
        startBox: pendingMove.startBox,
      });
      setPendingMove(null);
    };
    const onEnd = () => {
      interactionShellRectRef.current = null;
      setPendingMove(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [pendingMove]);

  const commitLabelEdit = () => {
    const id = editingLabelId;
    if (!id) return;
    const t = labelDraft.trim() || "Alan";
    onChange(
      fieldsRef.current.map((f) =>
        f.id === id ? { ...f, label: t } : f,
      ),
    );
    setEditingLabelId(null);
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const shell = interactionShellRectRef.current;
      if (!shell) return;
      const cur = clientToPct(e.clientX, e.clientY, shell);
      const dx = cur.x - drag.startPointerPct.x;
      const dy = cur.y - drag.startPointerPct.y;
      const b = drag.startBox;

      const wPx = Math.max(1, shell.width);
      const hPx = Math.max(1, shell.height);
      const s = ssRef.current;
      const curField = fieldsRef.current.find((x) => x.id === drag.id);
      if (!curField) return;

      if (isImageKind(curField)) {
        const bh = b.height;
        const bw = b.width;
        if (drag.kind === "move") {
          if (
            !s.enabled ||
            (!s.snapToGrid && !s.snapToOtherFields)
          ) {
            const nl = clamp(b.left + dx, 0, 100 - bw);
            const nt = clamp(b.top + dy, 0, 100 - bh);
            const patch = clampBox(
              quantizeBoxPrecision({ ...b, left: nl, top: nt }),
            );
            setSnapGuides(null);
            onChange(
              fieldsRef.current.map((fm) =>
                fm.id === drag.id ? { ...fm, box: patch } : fm,
              ),
            );
          } else {
            const axes = snapAxesForTextBands(
              fieldsRef.current,
              drag.id,
              s,
              wPx,
              hPx,
            );
            const r = magnetMoveImage(
              b,
              dx,
              dy,
              axes,
              wPx,
              hPx,
              s.thresholdPx,
            );
            setSnapGuides({ xv: r.vx, yv: r.vy });
            onChange(
              fieldsRef.current.map((fm) =>
                fm.id === drag.id ? { ...fm, box: r.box } : fm,
              ),
            );
          }
          return;
        }
        const edgeRaw = drag.imageResizeEdge ?? "e";
        let patch = applyImageBoxResize(
          b,
          edgeRaw as ImageResizeEdge,
          dx,
          dy,
        );
        if (
          s.enabled &&
          (s.snapToGrid || s.snapToOtherFields)
        ) {
          const axes = snapAxesForTextBands(
            fieldsRef.current,
            drag.id,
            s,
            wPx,
            hPx,
          );
          patch = magnetSnapImageResizeBox(
            patch,
            edgeRaw as ImageResizeMagnetEdge,
            axes,
            wPx,
            hPx,
            s.thresholdPx,
          );
        }
        setSnapGuides(null);
        onChange(
          fieldsRef.current.map((fm) =>
            fm.id === drag.id ? { ...fm, box: patch } : fm,
          ),
        );
        return;
      }

      const rawMoveCommitted = (): void => {
        const bp = textBandHeightPctForShell(hPx, curField);
        if (drag.kind === "move") {
          const nl = clamp(b.left + dx, 0, 100 - b.width);
          const nt = clamp(b.top + dy, 0, 100 - bp);
          const patch = clampBox(
            quantizeBoxPrecision({
              left: nl,
              top: nt,
              width: b.width,
              height: bp,
            }),
          );
          setSnapGuides(null);
          onChange(
            fieldsRef.current.map((fm) =>
              fm.id === drag.id ? { ...fm, box: patch } : fm,
            ),
          );
          return;
        }

        const nw = clamp(b.width + dx, 2, 100 - b.left);
        const patch = clampBox(
          quantizeBoxPrecision({
            ...b,
            width: nw,
            height: bp,
          }),
        );
        setSnapGuides(null);
        onChange(
          fieldsRef.current.map((fm) =>
            fm.id === drag.id ? { ...fm, box: patch } : fm,
          ),
        );
      };

      if (!s.enabled || (!s.snapToGrid && !s.snapToOtherFields)) {
        rawMoveCommitted();
        return;
      }

      const axes = snapAxesForTextBands(
        fieldsRef.current,
        drag.id,
        s,
        wPx,
        hPx,
      );

      if (drag.kind === "move") {
        const r = magnetMoveText(
          curField,
          drag.startBox,
          dx,
          dy,
          axes,
          wPx,
          hPx,
          s.thresholdPx,
        );
        setSnapGuides({ xv: r.vx, yv: r.vy });
        onChange(
          fieldsRef.current.map((f) =>
            f.id === drag.id
              ? {
                  ...f,
                  box: mergeCommittedBoxPartial(f, r.box, hPx),
                }
              : f,
          ),
        );
        return;
      }

      const r = magnetResizeTextWidth(
        curField,
        drag.startBox,
        dx,
        axes,
        wPx,
        hPx,
        s.thresholdPx,
      );
      setSnapGuides({ xv: r.vx, yv: r.vy });
      onChange(
        fieldsRef.current.map((f) =>
          f.id === drag.id
            ? { ...f, box: mergeCommittedBoxPartial(f, r.box, hPx) }
            : f,
        ),
      );
    };

    const onUp = (): void => {
      interactionShellRectRef.current = null;
      setSnapGuides(null);
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, onChange]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      if (!panRef.current || e.buttons !== 2) return;
      e.preventDefault();
      const p = panRef.current;
      el.scrollLeft = p.scrollL - (e.clientX - p.startX);
      el.scrollTop = p.scrollT - (e.clientY - p.startY);
    };
    const onUp = (e: PointerEvent) => {
      if (e.button === 2) panRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const sw = shellSize.width;
  const sh = shellSize.height;

  const CANVAS_PREVIEW_PAD_PX = 32;
  const previewMinBoxPx = useMemo(() => {
    return {
      w: Math.ceil(sw + CANVAS_PREVIEW_PAD_PX),
      h: Math.ceil(sh + CANVAS_PREVIEW_PAD_PX),
    };
  }, [sw, sh]);

  return (
    <div className="space-y-2">
      <p className="text-[11px] leading-snug text-muted">
        <strong className="font-medium text-foreground/90">Yakınlaştır:</strong>{" "}
        tekerlek ({Math.round(clamp(zoomPct, 25, 400))}
        %). <strong className="text-foreground/90">Sağ tık sürükle:</strong> görüntüyü
        kaydırın. Alanları sürükleyin veya kenarlarından ölçekleyin. Hizalama
        ayarları sağ kolondadır.
      </p>
      <div
        className="box-border mx-auto w-full overflow-hidden rounded-xl border-[0.5px] border-border/35 bg-surface-secondary/35 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] shadow-black/5 ring-[0.5px] ring-white/[0.02]"
        style={{
          minWidth: previewMinBoxPx.w,
          minHeight: previewMinBoxPx.h,
        }}
      >
        <div
          ref={viewportRef}
          tabIndex={0}
          role="application"
          aria-label="Şablon önizleme"
          onContextMenuCapture={(e) => {
            e.preventDefault();
          }}
          onPointerDown={(e) => {
            if (e.button !== 2) return;
            e.preventDefault();
            const vp = viewportRef.current;
            if (!vp) return;
            panRef.current = {
              startX: e.clientX,
              startY: e.clientY,
              scrollL: vp.scrollLeft,
              scrollT: vp.scrollTop,
            };
            vp.setPointerCapture(e.pointerId);
          }}
          className="max-h-[calc(100vh-10rem)] h-full min-h-full w-full cursor-default overflow-auto rounded-[inherit] bg-surface-tertiary/28 outline-none ring-0 focus:ring-1 focus:ring-accent/25"
        >
        <div
          className="inline-block min-w-max"
          style={{
            width: (sw + CANVAS_PREVIEW_PAD_PX) * viewportZoom,
            minHeight: (sh + CANVAS_PREVIEW_PAD_PX) * viewportZoom,
          }}
        >
          <div
            className="inline-block min-w-max origin-top-left leading-none"
            style={{
              transform: `scale(${viewportZoom})`,
              transformOrigin: "top left",
            }}
          >
            <div className="inline-block min-w-max p-4">
              <TemplateImageShell
                ref={wrapRef}
                src={backgroundDataUrl}
                alt="Şablon arka planı"
                onPointerDown={(e) => {
                  if (e.target === e.currentTarget && e.button === 0)
                    onSelect(null);
                }}
              >
            <>
              {fields.map((f, i) => {
                const sel = selectedId === f.id;
                const tb = fieldPlacementBoxPct(f, sw, sh);
                const zBase = sel ? 34 : 10 + i;
                const busyMove =
                  pendingMove?.id === f.id ||
                  (drag?.kind === "move" && drag.id === f.id);

                return (
                  <div
                    key={f.id}
                    role="presentation"
                    onContextMenuCapture={(e) => {
                      e.preventDefault();
                    }}
                    className={[
                      "pointer-events-auto overflow-hidden",
                      !isImageKind(f) ? "rounded-sm" : "",
                      "transition-colors duration-150 ease-out",
                      sel
                        ? `ps-selection-marquee ${isImageKind(f) ? "" : "rounded-sm"}`
                        : "border-0 border-transparent bg-transparent shadow-none",
                      busyMove ? "cursor-grabbing" : "cursor-grab",
                    ].join(" ")}
                    style={{
                      ...fieldBoxGeometryStyle(tb),
                      zIndex: zBase,
                      ...(isImageKind(f)
                        ? {
                            borderRadius: `${effectiveImageCornerRadiusPx(f, sw, sh)}px`,
                          }
                        : {}),
                    }}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      if (
                        (e.target as HTMLElement).closest(
                          "[data-role=field-resize]",
                        )
                      )
                        return;
                      e.stopPropagation();
                      onSelect(f.id);
                      if (editingLabelId === f.id) return;
                      const shell = readShellSnapRectForPointer(wrapRef.current);
                      if (!shell) return;
                      interactionShellRectRef.current = shell;
                      setPendingMove({
                        id: f.id,
                        startPointerPct: clientToPct(
                          e.clientX,
                          e.clientY,
                          shell,
                        ),
                        startBox: { ...f.box },
                        startClientX: e.clientX,
                        startClientY: e.clientY,
                      });
                    }}
                  >
                    {isImageKind(f) ? (
                      <>
                        <div className="absolute inset-0 z-[1] box-border flex items-center justify-center overflow-hidden bg-transparent p-px">
                          {f.imageDataUrl && f.imageDataUrl.length > 8 ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={f.imageDataUrl}
                              alt=""
                              draggable={false}
                              className={`h-full w-full pointer-events-none select-none ${imageObjectFitTailwindClass(f.imageObjectFit)}`}
                            />
                          ) : (
                            <span className="px-1 text-center text-[10px] leading-snug text-white/90">
                              Görsel yok — sağ panelden seçin
                            </span>
                          )}
                        </div>
                        {/* Yeniden boyutlandırma: yalnızca seçiliyken */}
                        {sel &&
                          (
                          [
                            ["n", "top-0 left-2 right-2 h-1.5 cursor-ns-resize", "Üst"],
                            ["s", "bottom-0 left-2 right-2 h-1.5 cursor-ns-resize", "Alt"],
                            ["e", "top-2 bottom-2 right-0 w-1.5 cursor-ew-resize", "Sağ"],
                            ["w", "top-2 bottom-2 left-0 w-1.5 cursor-ew-resize", "Sol"],
                          ] as const
                        ).map(([edge, posClass, title]) => (
                          <div
                            key={edge}
                            data-role="field-resize"
                            data-image-edge={edge}
                            className={`pointer-events-auto absolute z-[3] rounded-[2px] border-0 bg-transparent shadow-none outline-none ${posClass}`}
                            title={`Ölçek: ${title}`}
                            onPointerDown={(e) => {
                              if (e.button !== 0) return;
                              e.stopPropagation();
                              e.preventDefault();
                              onSelect(f.id);
                              setEditingLabelId(null);
                              const shellResize = readShellSnapRectForPointer(
                                wrapRef.current,
                              );
                              if (!shellResize) return;
                              interactionShellRectRef.current = shellResize;
                              setDrag({
                                kind: "resize",
                                id: f.id,
                                imageResizeEdge: edge as ImageResizeEdge,
                                startPointerPct: clientToPct(
                                  e.clientX,
                                  e.clientY,
                                  shellResize,
                                ),
                                startBox: { ...f.box },
                              });
                            }}
                          />
                        ))}
                      </>
                    ) : (
                      <>
                    <div className="absolute inset-0 z-[1] box-border flex min-h-0 items-center px-1.5">
                      {editingLabelId === f.id ? (
                        <input
                          autoFocus
                          type="text"
                          className="box-border max-h-[1.05em] w-full min-w-0 rounded-[2px] border-[0.5px] border-white/50 bg-white px-1 text-left font-sans antialiased outline-none ring-1 ring-sky-500/40"
                          style={fieldTextStyleCss(f)}
                          value={labelDraft}
                          onChange={(e) => setLabelDraft(e.target.value)}
                          onBlur={() => commitLabelEdit()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitLabelEdit();
                            if (e.key === "Escape") {
                              setEditingLabelId(null);
                              setLabelDraft(f.label ?? "");
                            }
                          }}
                          onPointerDown={(ev) => ev.stopPropagation()}
                        />
                      ) : (
                        <div
                          className="min-w-0 flex-1 cursor-text truncate whitespace-pre leading-none text-left font-sans antialiased outline-none selection:bg-cyan-500/35"
                          style={fieldTextStyleCss(f)}
                          onDoubleClick={(e) => {
                            if (e.button !== 0) return;
                            e.stopPropagation();
                            onSelect(f.id);
                            setLabelDraft(f.label || "");
                            setEditingLabelId(f.id);
                          }}
                        >
                          {f.label || "Alan"}
                        </div>
                      )}
                    </div>
                    {sel ? (
                      <div
                        data-role="field-resize"
                        className="pointer-events-auto absolute bottom-px right-px z-[2] h-3 w-3 cursor-ew-resize rounded-[3px] border-0 bg-transparent shadow-none outline-none"
                        title="Satır genişliği"
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.stopPropagation();
                          e.preventDefault();
                          onSelect(f.id);
                          setEditingLabelId(null);
                          const shellResize = readShellSnapRectForPointer(
                            wrapRef.current,
                          );
                          if (!shellResize) return;
                          interactionShellRectRef.current = shellResize;
                          setDrag({
                            kind: "resize",
                            id: f.id,
                            startPointerPct: clientToPct(
                              e.clientX,
                              e.clientY,
                              shellResize,
                            ),
                            startBox: { ...f.box },
                          });
                        }}
                      />
                    ) : null}
                      </>
                    )}
                  </div>
                );
              })}
              {drag !== null &&
                snapGuides !== null &&
                (snapGuides.xv.length > 0 ||
                  snapGuides.yv.length > 0) && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 z-[80]"
                  >
                    {snapGuides.xv.map((p) => (
                      <div
                        key={`v-${String(p)}`}
                        className="absolute bottom-0 top-0"
                        style={{
                          width: "0.5px",
                          left: `calc(${String(p)}% - 0.25px)`,
                          backgroundColor: "rgba(55,211,237,0.55)",
                          boxShadow: "none",
                          opacity: 1,
                        }}
                      />
                    ))}
                    {snapGuides.yv.map((p) => (
                      <div
                        key={`h-${String(p)}`}
                        className="absolute left-0 right-0"
                        style={{
                          height: "0.5px",
                          top: `calc(${String(p)}% - 0.25px)`,
                          backgroundColor: "rgba(244,114,182,0.5)",
                          boxShadow: "none",
                          opacity: 1,
                        }}
                      />
                    ))}
                  </div>
                )}
            </>
          </TemplateImageShell>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
