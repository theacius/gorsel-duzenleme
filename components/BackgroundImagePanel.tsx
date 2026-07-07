"use client";

import { Button, Surface } from "@heroui/react";
import { useCallback, useEffect, useRef, useState } from "react";

type BackgroundImagePanelProps = {
  /** data URL or empty */
  dataUrl: string;
  onPick: (dataUrl: string, labelHint: string) => void;
  /** Clear background (empty string) */
  onClear: () => void;
};

export function BackgroundImagePanel({
  dataUrl,
  onPick,
  onClear,
}: BackgroundImagePanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const loadFile = useCallback(
    (file: File) => {
      setLocalError(null);
      if (!file.type.startsWith("image/")) {
        setLocalError("Lütfen bir görsel dosyası seçin.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const r = reader.result;
        if (typeof r === "string") {
          const hint = file.name.replace(/\.[^/.]+$/, "") || "Şablon";
          onPick(r, hint);
        }
      };
      reader.readAsDataURL(file);
    },
    [onPick],
  );

  useEffect(() => {
    function preventDefaults(e: DragEvent) {
      e.preventDefault();
      e.stopPropagation();
    }
    window.addEventListener("dragenter", preventDefaults);
    window.addEventListener("dragover", preventDefaults);
    return () => {
      window.removeEventListener("dragenter", preventDefaults);
      window.removeEventListener("dragover", preventDefaults);
    };
  }, []);

  return (
    <Surface className="rounded-2xl border-[0.5px] border-border/45 p-4 shadow-sm shadow-black/15 ring-[0.5px] ring-white/[0.02]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">
            Şablon görseli (arka plan)
          </p>
          <p className="text-xs text-muted">
            PDF veya tasarım dosyanızın son hâlini yükleyin. Doldurulan teklif çıktısı
            bu yapı üzerine yazdırılır — çözünürlük ne kadar net olursa çıktı da o kadar
            keskindir.
          </p>
        </div>
        {dataUrl ? (
          <Button size="sm" variant="danger-soft" onPress={onClear}>
            Görseli kaldır
          </Button>
        ) : null}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) loadFile(f);
          e.target.value = "";
        }}
      />

      <div
        role={dataUrl ? undefined : "button"}
        tabIndex={dataUrl ? -1 : 0}
        className={[
          "relative flex min-h-[9rem] flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-dashed transition-[border-color,background-color,transform,box-shadow] duration-200 outline-none focus-visible:ring-1 focus-visible:ring-accent",
          dragActive
            ? "scale-[1.005] border-accent bg-accent/[0.08] ring-1 ring-accent/22"
            : "border-border/90 bg-surface-secondary/35 hover:border-accent/40 hover:bg-surface-secondary/55",
          dataUrl ? "p-2" : "cursor-pointer p-6",
        ].join(" ")}
        onDragEnter={() => setDragActive(true)}
        onDragLeave={() => setDragActive(false)}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          const f = e.dataTransfer.files?.[0];
          if (f) loadFile(f);
        }}
        onClick={
          dataUrl
            ? undefined
            : () => {
                fileRef.current?.click();
              }
        }
        onKeyDown={
          dataUrl
            ? undefined
            : (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileRef.current?.click();
                }
              }
        }
      >
        {dataUrl ? (
          <div className="relative h-40 w-full max-w-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={dataUrl}
              alt="Şablon önizleme"
              className="max-h-40 w-full object-contain"
            />
          </div>
        ) : (
          <>
            <span
              className="flex h-12 w-12 items-center justify-center rounded-2xl border-[0.5px] border-border/45 bg-surface-tertiary/45 text-muted shadow-inner shadow-black/18"
              aria-hidden
            >
              <svg
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 16V4m0 0l3.5 3.5M12 4L8.5 7.5" />
                <path d="M4 14.5V18a2 2 0 002 2h12a2 2 0 002-2v-3.5" />
              </svg>
            </span>
            <span className="max-w-[20rem] text-center text-sm leading-snug text-muted">
              Buraya görsel bırakın veya bu alana tıklayın
            </span>
            <Button
              size="sm"
              variant="secondary"
              type="button"
              className="shadow-sm"
              onPress={() => fileRef.current?.click()}
            >
              Dosya seç
            </Button>
          </>
        )}
      </div>

      {localError ? (
        <p className="mt-2 text-xs text-danger">{localError}</p>
      ) : null}
    </Surface>
  );
}
