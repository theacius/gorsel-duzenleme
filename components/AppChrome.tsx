"use client";

import { isTypingTarget } from "@/lib/dom-target";
import {
  Button,
  Kbd,
  Modal,
  useOverlayState,
} from "@heroui/react";
import { History } from "lucide-react";

import { useRouter } from "next/navigation";
import { swallowAsync } from "@/lib/swallow-async";

import { useCallback, useEffect } from "react";

/** Global help + command palette (? and Cmd/Ctrl+K). ESC closes overlays first. */
export function AppChrome({ children }: { children: React.ReactNode }) {
  const help = useOverlayState();
  const palette = useOverlayState();
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.repeat) return;

      const mod = e.ctrlKey || e.metaKey;

      if (e.key === "Escape") {
        if (palette.isOpen) {
          palette.close();
          e.preventDefault();
          return;
        }
        if (help.isOpen) {
          help.close();
          e.preventDefault();
          return;
        }
        return;
      }

      const typing = isTypingTarget(e.target);

      if (!typing && ((e.shiftKey && e.key === "?") || e.key === "?")) {
        help.toggle();
        e.preventDefault();
        return;
      }

      if (mod && !e.altKey && e.key.toLowerCase() === "k") {
        palette.open();
        e.preventDefault();
        return;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [help, palette]);

  const goNewTemplate = useCallback(() => {
    palette.close();
    swallowAsync(() => {
      router.push("/");
      window.dispatchEvent(new CustomEvent("teklif:new-template"));
    });
  }, [palette, router]);

  const isMac =
    typeof navigator !== "undefined" && navigator.platform.includes("Mac");

  return (
    <>
      {children}

      <Modal.Root state={help}>
        <Modal.Backdrop variant="opaque" isDismissable>
          <Modal.Container placement="center" size="lg" scroll="inside">
            <Modal.Dialog className="max-w-lg">
              <Modal.Header>
                <Modal.Heading>Kısayollar ve ipuçları</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="space-y-3 text-sm text-default-foreground/90">
                <p className="text-default-foreground/60">
                  Form alanında yazarken genel kısayollar tetiklenmez.
                </p>
                <ul className="space-y-2">
                  <li className="flex flex-wrap items-center justify-between gap-2">
                    <span>Yardım</span>
                    <span className="flex items-center gap-1">
                      <Kbd>?</Kbd>
                    </span>
                  </li>
                  <li className="flex flex-wrap items-center justify-between gap-2">
                    <span>Komut paleti</span>
                    <span className="flex items-center gap-1">
                      <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
                      <Kbd>K</Kbd>
                    </span>
                  </li>
                  <li className="flex flex-wrap items-center justify-between gap-2">
                    <span>Studio’da kaydet</span>
                    <span className="flex items-center gap-1">
                      <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
                      <Kbd>S</Kbd>
                    </span>
                  </li>
                  <li className="flex flex-wrap items-center justify-between gap-2">
                    <span>Doldur: PDF</span>
                    <span className="flex items-center gap-1">
                      <Kbd>Ctrl</Kbd>
                      <Kbd>Shift</Kbd>
                      <Kbd>P</Kbd>
                    </span>
                  </li>
                  <li className="flex flex-wrap items-center justify-between gap-2">
                    <span>Doldur: Word</span>
                    <span className="flex items-center gap-1">
                      <Kbd>Ctrl</Kbd>
                      <Kbd>Shift</Kbd>
                      <Kbd>W</Kbd>
                    </span>
                  </li>
                  <li className="flex flex-wrap items-center justify-between gap-2">
                    <span>Doldur: dışa aktar odağı</span>
                    <span className="flex items-center gap-1">
                      <Kbd>Ctrl</Kbd>
                      <Kbd>E</Kbd>
                    </span>
                  </li>
                </ul>
              </Modal.Body>
              <Modal.Footer>
                <Modal.CloseTrigger>
                  <Button variant="primary" size="sm">
                    Kapat
                  </Button>
                </Modal.CloseTrigger>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>

      <Modal.Root state={palette}>
        <Modal.Backdrop variant="opaque" isDismissable>
          <Modal.Container placement="top" scroll="inside" size="md">
            <Modal.Dialog className="mt-24 max-w-md">
              <Modal.Header>
                <Modal.Heading>Hızlı geçiş</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="space-y-2 text-sm">
                <Button
                  fullWidth
                  variant="secondary"
                  className="justify-start gap-3"
                  onPress={() => {
                    palette.close();
                    swallowAsync(() => router.push("/gecmis-doldurmalar"));
                  }}
                >
                  <History className="size-4 shrink-0 opacity-85" aria-hidden />
                  Geçmiş
                </Button>
                <Button
                  fullWidth
                  variant="secondary"
                  className="justify-start"
                  onPress={() => {
                    palette.close();
                    swallowAsync(() => router.push("/"));
                  }}
                >
                  Ana sayfa — şablon listesi
                </Button>
                <Button
                  fullWidth
                  variant="secondary"
                  className="justify-start"
                  onPress={() => goNewTemplate()}
                >
                  Yeni şablon (görsel seç)
                </Button>
                <Button
                  fullWidth
                  variant="secondary"
                  className="justify-start"
                  onPress={() => {
                    palette.close();
                    swallowAsync(() => router.push("/studio/new"));
                  }}
                >
                  Studio: boş yeni sayfa
                </Button>
              </Modal.Body>
              <Modal.Footer>
                <Modal.CloseTrigger>
                  <Button variant="ghost" size="sm">
                    Kapat
                  </Button>
                </Modal.CloseTrigger>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>
    </>
  );
}
