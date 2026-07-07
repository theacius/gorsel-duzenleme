"use client";

import { Button } from "@heroui/react";
import type { ReactPortal } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type DialogInner =
  | {
      mode: "alert";
      title: string;
      body: string;
    }
  | {
      mode: "confirm";
      title: string;
      body: string;
      danger?: boolean;
      confirmLabel: string;
      cancelLabel: string;
    }
  | {
      mode: "unsaved";
      title: string;
      body: string;
    };

export function useDialogs() {
  const [open, setOpen] = useState(false);
  const [dlg, setDlg] = useState<DialogInner | null>(null);

  const alertResolveRef = useRef<(() => void) | null>(null);
  const confirmResolveRef = useRef<((v: boolean) => void) | null>(null);
  const unsavedResolveRef =
    useRef<((v: "save" | "discard" | "cancel") => void) | null>(null);

  const wipe = (): void => {
    alertResolveRef.current = null;
    confirmResolveRef.current = null;
    unsavedResolveRef.current = null;
    setDlg(null);
    setOpen(false);
  };

  const alert = useCallback(
    (title: string, body: string): Promise<void> =>
      new Promise<void>((resolve) => {
        wipe();
        alertResolveRef.current = (): void => {
          wipe();
          resolve();
        };
        setDlg({ mode: "alert", title, body });
        setOpen(true);
      }),
    [],
  );

  const confirm = useCallback(
    (
      title: string,
      body: string,
      opts?: {
        danger?: boolean;
        confirmLabel?: string;
        cancelLabel?: string;
      },
    ): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        wipe();
        confirmResolveRef.current = (v: boolean): void => {
          wipe();
          resolve(v);
        };
        setDlg({
          mode: "confirm",
          title,
          body,
          danger: opts?.danger,
          confirmLabel: opts?.confirmLabel ?? "Tamam",
          cancelLabel: opts?.cancelLabel ?? "İptal",
        });
        setOpen(true);
      }),
    [],
  );

  const unsavedNavigate = useCallback(
    (): Promise<"save" | "discard" | "cancel"> =>
      new Promise<"save" | "discard" | "cancel">((resolve) => {
        wipe();
        unsavedResolveRef.current = (
          v: "save" | "discard" | "cancel",
        ): void => {
          wipe();
          resolve(v);
        };
        setDlg({
          mode: "unsaved",
          title: "Çıkmadan önce",
          body:
            "Kaydedilmemiş değişiklikleriniz var. Listeye dönmek için önce kaydedebilir ya da kaybetmeden çıkabilirsiniz.",
        });
        setOpen(true);
      }),
    [],
  );

  /** Tamam ile kapatmadan ÖNÇE kullanıcı callback’inin referansını al. */
  const alertAck = useCallback((): void => {
    const fn = alertResolveRef.current;
    wipe();
    fn?.();
  }, []);

  const confirmResult = useCallback((v: boolean): void => {
    const fn = confirmResolveRef.current;
    wipe();
    fn?.(v);
  }, []);

  const unsavedResult = useCallback(
    (v: "save" | "discard" | "cancel"): void => {
      const fn = unsavedResolveRef.current;
      wipe();
      fn?.(v);
    },
    [],
  );

  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open || !dlg) return;
    const esc = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (dlg.mode === "alert") alertAck();
      else if (dlg.mode === "confirm") confirmResult(false);
      else unsavedResult("cancel");
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, dlg, alertAck, confirmResult, unsavedResult]);

  const DialogOutlet = useCallback((): ReactPortal | null => {
    if (typeof document === "undefined") return null;
    if (!open || !dlg) return null;

    const backdrop = (): void => {
      if (dlg.mode === "alert") alertAck();
      else if (dlg.mode === "confirm") confirmResult(false);
      else unsavedResult("cancel");
    };

    const node = (
      <div className="fixed inset-0 z-[9998] flex items-end justify-center p-4 sm:items-center">
        <button
          type="button"
          aria-label="Pencereyi kapat"
          className="fixed inset-0 bg-black/55 backdrop-blur-[2px]"
          onClick={backdrop}
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
          className="relative z-[9999] max-h-[min(90vh,calc(100dvh-2rem))] w-full max-w-[min(100%,440px)] overflow-auto rounded-2xl border border-white/[0.095] shadow-2xl shadow-black/50 ring-1 ring-white/[0.06]"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-border/35 bg-accent/[0.06] px-6 py-4">
            <h2
              id={titleId}
              className="text-[15px] font-semibold leading-snug tracking-tight text-foreground"
            >
              {dlg.title}
            </h2>
          </div>
          <div className="px-6 pb-5 pt-4">
            <p
              id={descId}
              className="text-[13px] leading-relaxed text-muted sm:text-[14px]"
            >
              {dlg.body}
            </p>

            <div className="mt-6 flex flex-col gap-2.5">
              {dlg.mode === "alert" ? (
                <Button
                  variant="primary"
                  className="h-11 w-full justify-center font-semibold shadow-lg shadow-accent/20"
                  onPress={alertAck}
                >
                  Tamam
                </Button>
              ) : dlg.mode === "confirm" ? (
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    variant="outline"
                    className="h-10 min-w-[6.5rem] justify-center font-medium sm:w-auto"
                    onPress={() => confirmResult(false)}
                  >
                    {dlg.cancelLabel}
                  </Button>
                  <Button
                    variant={dlg.danger ? "danger-soft" : "primary"}
                    className={`h-10 min-w-[6.5rem] justify-center font-semibold sm:w-auto ${dlg.danger ? "" : "shadow-md shadow-accent/20"}`}
                    onPress={() => confirmResult(true)}
                  >
                    {dlg.confirmLabel}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="primary"
                      className="h-11 justify-center gap-2 font-semibold shadow-md shadow-accent/25"
                      onPress={() => unsavedResult("save")}
                    >
                      Önce kaydet
                    </Button>
                    <Button
                      variant="danger-soft"
                      className="h-11 justify-center font-medium ring-1 ring-danger/35"
                      onPress={() => unsavedResult("discard")}
                    >
                      Kaydetmeden çık
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    className="h-10 w-full justify-center text-muted hover:text-foreground"
                    onPress={() => unsavedResult("cancel")}
                  >
                    İptal · düzenlemeye devam et
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );

    return createPortal(node, document.body);
  }, [
    alertAck,
    confirmResult,
    dlg,
    open,
    titleId,
    descId,
    unsavedResult,
  ]);

  return {
    DialogOutlet,
    alert,
    confirm,
    unsavedNavigate,
  };
}
