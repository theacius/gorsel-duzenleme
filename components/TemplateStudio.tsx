"use client";

import { BackgroundImagePanel } from "@/components/BackgroundImagePanel";
import { TemplateEditor } from "@/components/TemplateEditor";
import { TemplateFill } from "@/components/TemplateFill";
import { ColorFieldNative } from "@/components/ColorFieldNative";
import { isTypingTarget } from "@/lib/dom-target";
import { serializeStudioDraftSnapshot } from "@/lib/studio-draft-serialize";
import {
  canonicalHexForColorInput,
  clampBox,
  duplicateTeklifField,
  isImageKind,
  migrateFieldsList,
  migrateField,
  newEmptyField,
  newImageLabelField,
  normalizeImageObjectFit,
  normalizeImageBorderRadiusPx,
  toPersistPayload,
  type TeklifField,
} from "@/lib/teklif-fields";
import type { StoredTemplate } from "@/lib/stored-template";
import {
  getRecentTemplateIds,
  pushRecentTemplateId,
} from "@/lib/recent-templates";
import { useDialogs } from "@/components/MessageDialogs";
import { swallowAsync } from "@/lib/swallow-async";
import {
  loadMagnetSettings,
  saveMagnetSettings,
  type MagnetSettings,
} from "@/lib/snap-settings";

import {
  Button,
  Card,
  Chip,
  Input,
  Separator,
  Spinner,
} from "@heroui/react";

import {
  ArrowLeft,
  History,
  Keyboard,
  Save,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const SESSION_DRAFT_KEY = "teklif-studio-draft-v1";

type DraftSessionPayload = {
  name: string;
  bg: string;
  fields: TeklifField[];
};

const FIELD_CLIPBOARD_V = 1;

function snapArr(f: TeklifField[]): TeklifField[] {
  return JSON.parse(JSON.stringify(f)) as TeklifField[];
}

type Mode = "list" | "edit" | "fill";

type TemplateStudioProps = {
  embedded?: "list" | "new" | "edit" | "fill";
  routeEditId?: string | null;
  routeFillId?: string | null;
};

export function TemplateStudio(props: TemplateStudioProps = {}) {
  const embedded = props.embedded ?? "list";
  const routeEditId = props.routeEditId ?? null;
  const routeFillId = props.routeFillId ?? null;

  const [mode, setMode] = useState<Mode>(() => {
    if (embedded === "fill") return "fill";
    if (
      embedded === "new" ||
      embedded === "edit"
    )
      return "edit";
    return "list";
  });



  const [list, setList] = useState<StoredTemplate[]>([]);
  const [busy, setBusy] = useState(false);

  const [savedId, setSavedId] = useState<string | null>(null);
  const [name, setName] = useState("Adsız şablon");
  const [bg, setBg] = useState("");
  const [fields, setFields] = useState<TeklifField[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [draftLabel, setDraftLabel] = useState("");

  const [fillTemplate, setFillTemplate] = useState<StoredTemplate | null>(
    null,
  );

  const router = useRouter();

  const {
    DialogOutlet,
    alert: dlgAlert,
    confirm: dlgConfirm,
    unsavedNavigate,
  } = useDialogs();

  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);

  const [magnetSettings, setMagnetSettings] = useState<MagnetSettings>(() =>
    loadMagnetSettings(),
  );

  useEffect(() => {
    saveMagnetSettings(magnetSettings);
  }, [magnetSettings]);

  const fieldsRef = useRef<TeklifField[]>([]);
  const historyLock = useRef(false);
  const pastFields = useRef<TeklifField[][]>([]);
  const futureFields = useRef<TeklifField[][]>([]);

  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  const dirty = useMemo(() => {
    if (savedSnapshot === null || mode !== "edit") return false;
    try {
      return (
        serializeStudioDraftSnapshot(name, bg, fields) !== savedSnapshot
      );
    } catch {
      return true;
    }
  }, [savedSnapshot, mode, name, bg, fields]);

  const applySavedSnapshot = useCallback(
    (snapshot: string): void => {
      setSavedSnapshot(snapshot);
      pastFields.current = [];
      futureFields.current = [];
    },
    [],
  );

  const commitFields = (
    next: TeklifField[] | ((rows: TeklifField[]) => TeklifField[]),
  ): void => {
    setFields((rows) => {
      const resolved =
        typeof next === "function" ? next(rows) : next;
      if (historyLock.current) return resolved;
      try {
        if (JSON.stringify(rows) === JSON.stringify(resolved)) {
          return resolved;
        }
      } catch {
        return resolved;
      }
      pastFields.current.push(snapArr(rows));
      if (pastFields.current.length > 80) pastFields.current.shift();
      futureFields.current = [];
      return resolved;
    });
  };

  const undoFields = (): void => {
    if (pastFields.current.length === 0 || historyLock.current) return;
    historyLock.current = true;
    const prev = pastFields.current.pop();
    if (prev === undefined) {
      historyLock.current = false;
      return;
    }
    futureFields.current.push(snapArr(fieldsRef.current));
    setFields(prev);
    requestAnimationFrame(() => {
      historyLock.current = false;
    });
  };

  const redoFields = (): void => {
    if (futureFields.current.length === 0 || historyLock.current) return;
    historyLock.current = true;
    const nxt = futureFields.current.pop();
    if (nxt === undefined) {
      historyLock.current = false;
      return;
    }
    pastFields.current.push(snapArr(fieldsRef.current));
    setFields(nxt);
    requestAnimationFrame(() => {
      historyLock.current = false;
    });
  };

  const refresh = useCallback(async () => {
    const r = await fetch("/api/templates");
    if (!r.ok) return;
    const j = (await r.json()) as { templates: StoredTemplate[] };
    setList(j.templates ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startNewTemplate = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file?.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const payload: DraftSessionPayload = {
          name: file.name.replace(/\.[^/.]+$/, "") || "Yeni şablon",
          bg: reader.result as string,
          fields: [],
        };
        sessionStorage.setItem(
          SESSION_DRAFT_KEY,
          JSON.stringify(payload),
        );
        router.push("/studio/new");
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const startNewTemplateRef = useRef(startNewTemplate);
  startNewTemplateRef.current = startNewTemplate;

  useEffect(() => {
    if (embedded !== "list") return;
    const handler = (): void => {
      startNewTemplateRef.current();
    };
    window.addEventListener("teklif:new-template", handler);
    return () =>
      window.removeEventListener("teklif:new-template", handler);
  }, [embedded]);

  const navigateToEdit = (id: string): void => {
    pushRecentTemplateId(id);
    router.push(`/studio/${encodeURIComponent(id)}`);
  };

  const navigateToFill = (id: string): void => {
    pushRecentTemplateId(id);
    router.push(`/fill/${encodeURIComponent(id)}`);
  };

  /** /studio/new — görsel seçiminden sessionStorage ile */
  useEffect(() => {
    if (embedded !== "new") return;
    const raw = sessionStorage.getItem(SESSION_DRAFT_KEY);
    sessionStorage.removeItem(SESSION_DRAFT_KEY);
    if (raw) {
      try {
        const d = JSON.parse(raw) as DraftSessionPayload;
        if (typeof d.bg === "string") {
          const n = typeof d.name === "string" ? d.name : "Adsız şablon";
          const fld = migrateFieldsList(Array.isArray(d.fields) ? d.fields : []);
          setName(n);
          setBg(d.bg);
          setFields(fld);
          setSavedId(null);
          setSelectedId(null);
          applySavedSnapshot(serializeStudioDraftSnapshot(n, d.bg, fld));
          return;
        }
      } catch {
        /* fall through */
      }
    }
    setSavedId(null);
    setName("Adsız şablon");
    setBg("");
    setFields([]);
    applySavedSnapshot(serializeStudioDraftSnapshot("Adsız şablon", "", []));
  }, [embedded, applySavedSnapshot]);

  /** Kayıtlı şablon: /studio/[uuid] */
  useEffect(() => {
    if (embedded !== "edit" || !routeEditId) return;
    let cancel = false;
    (async (): Promise<void> => {
      setBusy(true);
      try {
        const r = await fetch(
          `/api/templates/${encodeURIComponent(routeEditId)}`,
        );
        if (!r.ok) throw new Error("okuma");
        const t = (await r.json()) as StoredTemplate;
        if (cancel) return;
        const mf = migrateFieldsList(t.fields);
        setSavedId(t.id);
        setName(t.name);
        setBg(t.backgroundDataUrl);
        setFields(mf);
        setSelectedId(null);
        setDraftLabel("");
        applySavedSnapshot(
          serializeStudioDraftSnapshot(t.name, t.backgroundDataUrl, mf),
        );
      } catch {
        if (!cancel) {
          void (async (): Promise<void> => {
            await dlgAlert(
              "Şablon yüklenemedi",
              "Dosya bulunamadı veya sunucuya erişilemiyor. Ana sayfaya yönlendirileceksiniz.",
            );
            router.push("/");
          })();
        }
      } finally {
        if (!cancel) setBusy(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [embedded, routeEditId, router, applySavedSnapshot]);

  /** Doldur: /fill/[uuid] */
  useEffect(() => {
    if (embedded !== "fill" || !routeFillId) return;
    let cancel = false;
    (async (): Promise<void> => {
      setBusy(true);
      try {
        const r = await fetch(
          `/api/templates/${encodeURIComponent(routeFillId)}`,
        );
        if (!r.ok) throw new Error("okuma");
        const t = (await r.json()) as StoredTemplate;
        if (cancel) return;
        setFillTemplate(t);
      } catch {
        if (!cancel) {
          void (async (): Promise<void> => {
            await dlgAlert(
              "Şablon bulunamadı",
              "Şablon mevcut değil veya silinmiş olabilir. Ana sayfaya yönlendirileceksiniz.",
            );
            router.push("/");
          })();
        }
      } finally {
        if (!cancel) setBusy(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [embedded, routeFillId, router]);

  useEffect(() => {
    if (!dirty || mode !== "edit") return;
    const warn = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, mode]);

  const duplicateTemplate = async (t: StoredTemplate) => {
    setBusy(true);
    try {
      const payload = {
        name: `${t.name} (kopya)`,
        backgroundDataUrl: t.backgroundDataUrl,
        fields: toPersistPayload(migrateFieldsList(t.fields)),
      };
      const r = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error("kopya");
      const created = (await r.json()) as StoredTemplate;
      pushRecentTemplateId(created.id);
      await refresh();
    } catch {
      await dlgAlert(
        "Çoğaltılamadı",
        "Şablon kopyalanırken beklenmedik bir hata oluştu. Bağlantınızı ve disk alanını kontrol edin.",
      );
    } finally {
      setBusy(false);
    }
  };

  const saveTemplate = async (): Promise<boolean> => {
    if (!bg) return false;
    const safe = toPersistPayload(fields);
    setBusy(true);
    try {
      if (!savedId) {
        const r = await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            backgroundDataUrl: bg,
            fields: safe,
          }),
        });
        if (!r.ok) throw new Error("kayıt");
        const t = (await r.json()) as StoredTemplate;
        setSavedId(t.id);
        pushRecentTemplateId(t.id);
        applySavedSnapshot(
          serializeStudioDraftSnapshot(name, bg, fields),
        );
        if (embedded === "new")
          router.replace(`/studio/${encodeURIComponent(t.id)}`);
      } else {
        const r = await fetch(`/api/templates/${savedId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            backgroundDataUrl: bg,
            fields: safe,
          }),
        });
        if (!r.ok) throw new Error("güncelle");
        applySavedSnapshot(
          serializeStudioDraftSnapshot(name, bg, fields),
        );
      }
      await refresh();
      return true;
    } catch {
      await dlgAlert(
        "Kayıt başarısız",
        "Şablon diske yazılamadı. Bağlantıyı kontrol edip yeniden deneyin.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveTemplateRef = useRef(saveTemplate);
  saveTemplateRef.current = saveTemplate;

  const importJsonInputRef = useRef<HTMLInputElement>(null);
  const imageLabelInputRef = useRef<HTMLInputElement>(null);

  const goToHome = useCallback(async (): Promise<void> => {
    if (mode === "edit" && dirty) {
      const choice = await unsavedNavigate();
      if (choice === "cancel") return;
      if (choice === "save") {
        const ok = await saveTemplateRef.current();
        if (ok) router.push("/");
        return;
      }
      router.push("/");
      return;
    }
    router.push("/");
  }, [mode, dirty, router, unsavedNavigate]);

  const removeTemplate = async (id: string): Promise<void> => {
    const yes = await dlgConfirm(
      "Şablonu sil?",
      "Bu şablon listeden kalıcı olarak silinir. Yerel yedek dışına aktarılmadıysa geri gelmez.",
      {
        danger: true,
        confirmLabel: "Evet, sil",
        cancelLabel: "İptal",
      },
    );
    if (!yes) return;
    setBusy(true);
    try {
      await fetch(`/api/templates/${id}`, { method: "DELETE" });
      await refresh();
    } catch {
      await dlgAlert(
        "Silinemedi",
        "Şablon silinemedi — dosya kilitlenmiş olabilir veya diske yazılamıyor.",
      );
    } finally {
      setBusy(false);
    }
  };

  const exportJson = async () => {
    try {
      const r = await fetch("/api/templates/export");
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "teklif-sablonlari.json";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      await dlgAlert(
        "Dışa aktarılamadı",
        "Yedeği oluştururken bir sorun oluştu. Tekrar deneyin.",
      );
    }
  };

  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const text = reader.result as string;
        const data = JSON.parse(text) as { templates?: StoredTemplate[] };
        if (!Array.isArray(data.templates)) {
          await dlgAlert(
            "Geçersiz dosya",
            "Seçilen dosya beklenen yapıda değil: kök dizinde `templates` dizisi olmalı.",
          );
          return;
        }
        setBusy(true);
        const r = await fetch("/api/templates/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templates: data.templates, mode: "merge" }),
        });
        if (!r.ok) throw new Error("import");
        await refresh();
      } catch {
        await dlgAlert(
          "İçe aktarılamadı",
          "Dosya JSON formatında olmalı ve geçerli bir şablon yedeği içermeli.",
        );
      } finally {
        setBusy(false);
      }
    };
    reader.readAsText(file);
  };

  const addImageLabelFromFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      await dlgAlert(
        "Geçersiz dosya",
        "Yalnızca görsel dosyası (JPEG, PNG, WebP vb.) seçebilirsiniz.",
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r !== "string") return;
      const hint = file.name.replace(/\.[^/.]+$/, "") || "Görsel etiket";
      const tf = newImageLabelField(hint, r);
      commitFields((prev) => [...prev, tf]);
      setSelectedId(tf.id);
    };
    reader.readAsDataURL(file);
  };

  const addDraftField = () => {
    const tf = newEmptyField(draftLabel.trim());
    commitFields((prev) => [...prev, tf]);
    setSelectedId(tf.id);
    setDraftLabel("");
  };

  const patchSelectedBox = (
    patch: Partial<TeklifField["box"]>,
  ) => {
    if (!selectedId) return;
    commitFields((rows) =>
      rows.map((f) =>
        f.id === selectedId
          ? {
              ...f,
              box: clampBox({
                ...f.box,
                ...patch,
              }),
            }
          : f,
      ),
    );
  };

  const updateSelectedFull = (updater: (f: TeklifField) => TeklifField) => {
    if (!selectedId) return;
    commitFields((rows) =>
      rows.map((f) => (f.id === selectedId ? updater(f) : f)),
    );
  };

  const removeSelectedField = () => {
    if (!selectedId) return;
    const id = selectedId;
    commitFields((rows) => rows.filter((x) => x.id !== id));
    setSelectedId(null);
  };

  const removeSelectedFieldRef = useRef(removeSelectedField);
  removeSelectedFieldRef.current = removeSelectedField;

  const duplicateFieldById = (id: string): void => {
    let nid: string | null = null;
    commitFields((rows) => {
      const src = rows.find((x) => x.id === id);
      if (!src) return rows;
      const dup = duplicateTeklifField(src);
      nid = dup.id;
      const i = rows.findIndex((x) => x.id === id);
      if (i < 0) return rows;
      const next = [...rows];
      next.splice(i + 1, 0, dup);
      return next;
    });
    if (nid) setSelectedId(nid);
  };

  const duplicateFieldByIdRef = useRef(duplicateFieldById);
  duplicateFieldByIdRef.current = duplicateFieldById;

  const removeFieldById = async (id: string): Promise<void> => {
    const ok = await dlgConfirm(
      "Alan kaldırılsın mı?",
      "Bu kutuyu kaldırırsanız şablondan ve PDF çıktısından da çıkar. İsterseniz önce Çoğalt ile yedeğini alabilirsiniz.",
      {
        danger: true,
        confirmLabel: "Kaldır",
        cancelLabel: "İptal",
      },
    );
    if (!ok) return;
    commitFields((rows) => rows.filter((x) => x.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  };

  /** Kısayollar: form alanı yazarken metin girişini bozmamak için seçici uygulanır. */
  useEffect(() => {
    if (mode !== "edit") return;
    async function saveHotkey(): Promise<void> {
      await saveTemplateRef.current();
    }
    async function pasteFromClip(txt: string): Promise<void> {
      let data: unknown;
      try {
        data = JSON.parse(txt) as {
          v?: number;
          field?: TeklifField;
        };
      } catch {
        return;
      }
      const o = data as { v?: number; field?: TeklifField };
      if (
        o?.v !== FIELD_CLIPBOARD_V ||
        !o.field ||
        typeof o.field !== "object"
      )
        return;
      const pasted = migrateField({
        ...o.field,
      } as TeklifField & Record<string, unknown>);
      const dup = duplicateTeklifField(pasted);
      commitFields((rows) => [...rows, dup]);
      setSelectedId(dup.id);
    }

    function onKey(e: KeyboardEvent): void {
      if (e.repeat) return;
      const typing = isTypingTarget(e.target);

      if (e.key === "Delete" && !typing) {
        if (selectedId) {
          e.preventDefault();
          removeSelectedFieldRef.current();
        }
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.altKey) return;
      const k = e.key.toLowerCase();
      const canvas = !typing;

      if (k === "s") {
        e.preventDefault();
        void saveHotkey();
        return;
      }
      if (k === "z" && e.shiftKey && canvas) {
        e.preventDefault();
        redoFields();
        return;
      }
      if (k === "z" && !e.shiftKey && canvas) {
        e.preventDefault();
        undoFields();
        return;
      }
      if (k === "y" && canvas) {
        e.preventDefault();
        redoFields();
        return;
      }
      if (k === "c" && canvas && selectedId) {
        const f = fieldsRef.current.find((x) => x.id === selectedId);
        if (!f) return;
        e.preventDefault();
        void navigator.clipboard.writeText(
          JSON.stringify({
            v: FIELD_CLIPBOARD_V,
            field: snapArr([f])[0],
          }),
        );
        return;
      }
      if (k === "v" && canvas) {
        e.preventDefault();
        void navigator.clipboard
          .readText()
          .then((t) => pasteFromClip(t))
          .catch(() => {});
        return;
      }
      if (k === "d" && canvas && selectedId) {
        e.preventDefault();
        duplicateFieldByIdRef.current(selectedId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, selectedId]);


  const selected = fields.find((f) => f.id === selectedId) ?? null;

  const recentCards = useMemo(() => {
    const ids = getRecentTemplateIds();
    const byId = new Map(list.map((t) => [t.id, t]));
    return ids
      .map((id) => byId.get(id))
      .filter((x): x is StoredTemplate => !!x);
  }, [list]);

  if (mode === "fill" && fillTemplate) {
    return (
      <>
        <DialogOutlet />
      <section aria-labelledby="fill-page-heading" className="w-full">
        <header className="mb-8 flex flex-col gap-5 border-b border-border/35 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Doldurma
            </p>
            <h1
              id="fill-page-heading"
              className="truncate text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
              title={fillTemplate.name}
            >
              {fillTemplate.name}
            </h1>
            <p className="max-w-3xl text-sm leading-relaxed text-muted">
              Alanlara tıklayıp yazın; burası yalnızca ekran önizlemesidir —
              çıktılar her zaman net çözünürlükte üretilir. Tekerlek ile yakınlığı
              değiştirebilirsiniz.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="outline" onPress={() => swallowAsync(async () => goToHome())}>
              Şablonlara dön
            </Button>
            <Button
              variant="secondary"
              className="inline-flex items-center gap-2"
              onPress={() =>
                swallowAsync(() => router.push("/gecmis-doldurmalar"))
              }
            >
              <History className="size-[1.125rem] shrink-0" strokeWidth={2} aria-hidden />
              Geçmiş
            </Button>
          </div>
        </header>
        <TemplateFill
          key={`${fillTemplate.id}-${fillTemplate.updatedAt}`}
          template={fillTemplate}
        />
      </section>
      </>
    );
  }

  if (mode === "edit") {
    const stepCircle =
      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/15 text-xs font-bold text-accent tabular-nums";

    return (
      <>
        <DialogOutlet />
      <section
        aria-labelledby="studio-toolbar-heading"
        className="space-y-8"
      >
        <h2 id="studio-toolbar-heading" className="sr-only">
          Şablon düzenleyici araçları
        </h2>

        <div className="rounded-2xl border border-border/45 bg-surface-secondary/40 p-4 shadow-lg shadow-black/15 ring-[0.5px] ring-white/[0.03] backdrop-blur-sm sm:p-5">
          <div className="flex min-w-0 flex-wrap items-center gap-3 border-b border-border/40 pb-4">
              <Button
                variant="outline"
                className="shrink-0 font-medium"
                isDisabled={busy}
                onPress={() => swallowAsync(async () => goToHome())}
              >
                <span className="inline-flex items-center gap-2">
                  <ArrowLeft className="size-4 opacity-85" aria-hidden />
                  Şablon listesi
                </span>
              </Button>
              {dirty ? (
                <Chip size="sm" variant="soft" color="warning">
                  Kaydedilmemiş değişiklik
                </Chip>
              ) : savedId ? (
                <Chip size="sm" variant="soft" color="success">
                  Son sürümle uyumlu
                </Chip>
              ) : null}
            </div>

            <div className="min-w-0 space-y-1.5 pt-5">
              <label
                htmlFor="studio-template-name"
                className="text-[11px] font-medium uppercase tracking-wide text-muted"
              >
                Şablon adı
              </label>
              <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                <Input
                  id="studio-template-name"
                  aria-describedby="studio-template-name-hint"
                  placeholder="Örn. Standart CNC teklifi 2026"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full sm:min-h-10"
                />
                <Button
                  variant="primary"
                  className="h-10 min-w-[9.5rem] w-full shrink-0 justify-center font-semibold shadow-md shadow-accent/25 sm:w-auto"
                  isDisabled={busy || !bg}
                  onPress={() => swallowAsync(() => saveTemplate())}
                >
                  {busy ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner size="sm" />
                      Kaydediliyor…
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <Save className="size-4 opacity-95" aria-hidden />
                      {savedId ? "Değişiklikleri kaydet" : "Şablonu kaydet"}
                    </span>
                  )}
                </Button>
              </div>
              <p
                id="studio-template-name-hint"
                className="text-[11px] leading-snug text-muted"
              >
                Liste ve çıktılarda görünen başlıktır.
              </p>
            </div>

          <p className="mt-4 border-t border-border/40 pt-3 text-[11px] leading-relaxed text-muted">
            Kayıt yalnızca bu bilgisayardaki proje klasörüne yazılır; buluta veya harici
            sunucuya gönderilmez.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-start gap-3">
            <span
              className={`${stepCircle} !h-7 !w-7 text-[11px]`}
              aria-hidden
            >
              1
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                Teklif yüzü (arka plan)
              </h2>
              <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted">
                PDF veya sunumdan dışa aktardığınız görüntüyü buraya koyun. Bu görüntü,
                doldurma önizlemesi ve nihai çıktının omurgasıdır.
              </p>
            </div>
          </div>
          <BackgroundImagePanel
            dataUrl={bg}
            onPick={(next, hint) => {
              setBg(next);
              const fallback =
                name.trim() === "" || name.trim() === "Adsız şablon";
              if (!savedId || fallback) setName(hint.slice(0, 120) || "Yeni şablon");
            }}
            onClear={() => setBg("")}
          />
        </div>

        <div className="flex flex-col gap-8 xl:flex-row xl:items-start">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex flex-wrap items-start gap-3">
              <span
                className={`${stepCircle} !h-7 !w-7 text-[11px]`}
                aria-hidden
              >
                2
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold tracking-tight text-foreground">
                  Tasarım yüzeyi
                </h2>
                <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted">
                  Çerçeve içinde kutuları sürükleyin; köşelerden boyut verin. Seçim
                  sağ panelde vurgulanır — oradan etiket, yazı rengi ve konum değerlerini
                  düzenleyin.
                </p>
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-border/50 bg-surface-secondary/25 shadow-inner shadow-black/10 ring-[0.5px] ring-white/[0.04]">
              <TemplateEditor
                backgroundDataUrl={bg}
                fields={fields}
                magnetSettings={magnetSettings}
                onMagnetSettingsChange={setMagnetSettings}
                onChange={commitFields}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
            <p className="flex flex-wrap items-start gap-2 rounded-xl border border-dashed border-border/55 bg-muted/15 px-3 py-2.5 text-[11px] leading-relaxed text-muted">
              <Keyboard
                className="mt-0.5 size-3.5 shrink-0 text-accent/80"
                aria-hidden
              />
              <span>
                Odak canvas&apos;tayken:{" "}
                <kbd className="rounded border border-border/55 bg-background/90 px-1 font-mono text-[10px]">
                  Ctrl+Z
                </kbd>{" "}
                geri,{" "}
                <kbd className="rounded border border-border/55 bg-background/90 px-1 font-mono text-[10px]">
                  ⌫
                </kbd>{" "}
                seçili kutuyu sil,{" "}
                <kbd className="rounded border border-border/55 bg-background/90 px-1 font-mono text-[10px]">
                  Ctrl+D
                </kbd>{" "}
                çoğalt.
              </span>
            </p>
          </div>

          <aside
            className="w-full shrink-0 space-y-5 rounded-2xl border border-border/50 bg-gradient-to-b from-surface-secondary/60 to-muted/35 p-5 text-sm shadow-xl shadow-black/20 ring-[0.5px] ring-accent/15 backdrop-blur-md lg:sticky lg:top-24 lg:max-h-[calc(100vh-6rem)] lg:w-[27rem] lg:overflow-y-auto xl:w-[28rem]"
            aria-label="Alan ve biçim paneli"
          >
            <div className="border-b border-border/45 pb-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                Sağ kolon
              </p>
              <h3 className="mt-1.5 text-lg font-semibold tracking-tight text-foreground">
                Alanları yönetin
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                Önce alan oluşturun, sonra satırdan veya yüzeyde tıklayarak seçip ince ayar yapın.
                Sağdan yaptığınız düzen, PDF/Word&apos;te görünümü belirler.
              </p>
            </div>

            <div
              role="region"
              aria-labelledby="studio-hizalama-heading"
              className="rounded-xl border border-border/55 bg-muted/25 p-4"
            >
              <h3
                id="studio-hizalama-heading"
                className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-foreground"
              >
                Hizalama
              </h3>
              <p className="mb-4 text-[12px] leading-relaxed text-muted">
                Kutuları sürüklerken kenarların ve yazı sıralarının yüzeye ve birbirlerine paralel
                kaldığı anda hafifçe &quot;kilitlenmesi&quot; — dağınıklığı azaltır. PDF çıktısına
                fazladan çizgi eklenmez; yalnızca düzenleyici sırasında kullanılan yardımcı
                araçlarından biridir.
              </p>
              <label className="flex cursor-pointer items-start gap-2 py-1 text-[12px] text-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-border bg-surface-tertiary accent-accent"
                  checked={magnetSettings.enabled}
                  onChange={(e) =>
                    setMagnetSettings((prev) => ({
                      ...prev,
                      enabled: e.target.checked,
                    }))
                  }
                />
                <span>
                  <span className="font-medium text-foreground">Yardım açık</span>
                  <span className="mt-1 block text-[11px] leading-snug text-muted">
                    Kapatırsanız tüm yakalama kapanır; yalın manuel yerleştirme yapılır.
                  </span>
                </span>
              </label>
              <div className="mt-3 space-y-3 border-t border-border/50 pt-3">
                <label className="flex cursor-pointer items-start gap-2 text-[12px] text-foreground">
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-border bg-surface-tertiary accent-accent"
                    checked={magnetSettings.snapToGrid}
                    disabled={!magnetSettings.enabled}
                    onChange={(e) =>
                      setMagnetSettings((prev) => ({
                        ...prev,
                        snapToGrid: e.target.checked,
                      }))
                    }
                  />
                  <span>
                    <span className="font-medium">Izgara&apos;ya yakalama</span>
                    <span className="mt-1 block text-[11px] leading-snug text-muted">
                      Teklif yüzünü yüzde tabanlı ızgara çizgilerine yaklaştırır; blokları aynı
                      dikey / yatay ritimde dizmeye yarar.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-[12px] text-foreground">
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-border bg-surface-tertiary accent-accent"
                    checked={magnetSettings.snapToOtherFields}
                    disabled={!magnetSettings.enabled}
                    onChange={(e) =>
                      setMagnetSettings((prev) => ({
                        ...prev,
                        snapToOtherFields: e.target.checked,
                      }))
                    }
                  />
                  <span>
                    <span className="font-medium">Diğer alanlara yakalama</span>
                    <span className="mt-1 block text-[11px] leading-snug text-muted">
                      Yakındaki kutuların yazı sırasıyla hiza çizgilerini paylaşırsınız (örneğin iki
                      başlığı aynı tabanda hizalamak için).
                    </span>
                  </span>
                </label>
              </div>
              <div className="mt-4 space-y-4 border-t border-border/45 pt-3">
                <div>
                  <label
                    className="text-[11px] font-semibold uppercase tracking-wide text-muted"
                    htmlFor="studio-grid-step"
                  >
                    Izgara adımı (% yüzeye göre)
                  </label>
                  <p className="mt-1 text-[11px] leading-snug text-muted">
                    Küçük değer daha sık ara nokta; geniş ara hatlar için daha büyük değeri seçin.
                  </p>
                  <select
                    id="studio-grid-step"
                    className="mt-2 w-full rounded-lg border-[0.5px] border-border/55 bg-background/80 px-2.5 py-2 text-sm text-foreground"
                    disabled={!magnetSettings.enabled || !magnetSettings.snapToGrid}
                    value={magnetSettings.gridStep}
                    onChange={(e) =>
                      setMagnetSettings((prev) => ({
                        ...prev,
                        gridStep: Number(e.target.value),
                      }))
                    }
                  >
                    {[1, 2, 5, 10].map((n) => (
                      <option key={n} value={n}>
                        {n}%
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    className="text-[11px] font-semibold uppercase tracking-wide text-muted"
                    htmlFor="studio-snap-threshold"
                  >
                    Yakalama hassasiyeti (piksel)
                  </label>
                  <p className="mt-1 text-[11px] leading-snug text-muted">
                    Fare yakalama doğrusuna ne kadar yaklaşınca yapışılacağı; düşük değer sıkı, yüksek
                    değer daha toleranslı hizayı ifade eder.
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <input
                      id="studio-snap-threshold"
                      type="range"
                      min={3}
                      max={48}
                      disabled={!magnetSettings.enabled}
                      value={magnetSettings.thresholdPx}
                      className="h-2 min-w-[10rem] flex-1 accent-[var(--accent)] disabled:opacity-45"
                      onChange={(e) =>
                        setMagnetSettings((prev) => ({
                          ...prev,
                          thresholdPx: Number(e.target.value),
                        }))
                      }
                    />
                    <span className="w-12 text-xs tabular-nums text-muted">
                      ±{magnetSettings.thresholdPx}px
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-foreground">
                1 · Yeni alan
              </h3>
              <p className="mb-2 text-xs leading-relaxed text-muted">
                Metin alanı: etiket · Enter veya Oluştur. Çıktıda doldurulan
                yazı alanlarıdır.{" "}
                <Chip variant="soft" color="accent" size="sm" className="mx-1">
                  Metin
                </Chip>
                Görsel etiket (logo/damga): şablona sabit küçük görsel — doldurma
                sayfasında değiştirilmez.
              </p>
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder="Örn. Firma adı"
                  value={draftLabel}
                  aria-label="Yeni alan etiketi"
                  onChange={(e) => setDraftLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addDraftField();
                    }
                  }}
                  className="min-w-[14rem] flex-1"
                />
                <Button variant="secondary" onPress={addDraftField}>
                  Metin oluştur
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  ref={imageLabelInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-hidden
                  tabIndex={-1}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f)
                      swallowAsync(async () =>
                        addImageLabelFromFile(f),
                      );
                  }}
                />
                <Button
                  variant="outline"
                  onPress={() => imageLabelInputRef.current?.click()}
                >
                  Görsel etiket ekle
                </Button>
              </div>
            </div>

            <div className="border-border border-t pt-4">
              <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-foreground">
                2 · Şablondaki alanlar
              </h3>
              <p className="mb-2 text-xs leading-relaxed text-muted">
                Listeden veya yüzeyde tıklayarak seçim yapın — satırdaki etiket, PDF
                çıktısında kullanıcıya görünür.{" "}
                <Chip variant="soft" color="default" size="sm" className="mx-0.5">
                  Metin
                </Chip>{" "}
                türleri doldurmaya açık; görsel sabittir.
              </p>
              {fields.length === 0 ? (
                <p className="rounded-lg border-[0.5px] border-dashed border-accent/35 bg-accent/[0.06] px-3 py-4 text-center text-xs leading-relaxed text-muted">
                  Önce bir metin kutusu oluşturun veya küçük logo için görsel ekleyin —
                  seçildiğinde aşağıda biçimi düzenlenebilir.
                </p>
              ) : (
                <ul className="border-border/40 max-h-80 space-y-1 overflow-y-auto rounded-lg border-[0.5px] bg-surface-tertiary/28 p-1.5">
                  {fields.map((f, idx) => {
                    const sel = selectedId === f.id;
                    return (
                      <li
                        key={f.id}
                        className={[
                          "flex gap-1 rounded-md border-[0.5px] border-transparent p-0.5 transition-colors",
                          sel
                            ? "border-accent bg-accent/15"
                            : "hover:border-border",
                        ].join(" ")}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedId(f.id)}
                          className={[
                            "flex min-w-0 flex-1 items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition-colors",
                            sel ? "text-accent" : "text-foreground hover:bg-surface-secondary/80",
                          ].join(" ")}
                        >
                          <span className="w-6 shrink-0 text-[10px] tabular-nums text-muted">
                            {idx + 1}.
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {f.label || "Etiketsiz"}
                          </span>
                          {(f.textStyle.bold || f.textStyle.italic) && (
                            <span className="text-[9px] uppercase tracking-wide text-muted">
                              {[
                                f.textStyle.bold ? "K" : null,
                                f.textStyle.italic ? "İ" : null,
                              ]
                                .filter(Boolean)
                                .join("")}
                            </span>
                          )}
                          <Chip variant="tertiary" size="sm">
                            {isImageKind(f) ? "Görsel" : "Metin"}
                          </Chip>
                        </button>

                        <div
                          className="flex shrink-0 items-center gap-1 self-center"
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="secondary"
                            size="sm"
                            aria-label="Çoğalt (kaydırılmış kopya)"
                            onPress={() => duplicateFieldById(f.id)}
                          >
                            Çoğalt
                          </Button>
                          <Button
                            variant="danger-soft"
                            size="sm"
                            aria-label="Kaldır"
                            onPress={() =>
                              swallowAsync(async () => removeFieldById(f.id))
                            }
                          >
                            Sil
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {selected ? (
              <div className="space-y-3 border-t border-border pt-4">
                <div>
                  <h3 className="text-[13px] font-semibold uppercase tracking-wide text-foreground">
                    3 · Seçili alan
                  </h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">
                    Pozisyon yüzdesi tasarımda çizilen çerçeveyi, yazı seçenekleri ise
                    doldurulmuş metnin görünüşünü belirler.
                  </p>
                </div>
                <label className="block">
                  <span className="text-xs text-muted">Etiket</span>
                  <input
                    type="text"
                    className="mt-1 w-full rounded border-[0.5px] border-border/45 bg-surface-tertiary px-2 py-1 text-xs text-foreground outline-none ring-offset-2 ring-offset-background focus-visible:ring-1 focus-visible:ring-accent"
                    value={selected.label}
                    onChange={(e) =>
                      updateSelectedFull((f) => ({
                        ...f,
                        label: e.target.value,
                      }))
                    }
                  />
                </label>

                {isImageKind(selected) ? (
                  <>
                  <label className="block">
                    <span className="text-xs text-muted">Görsel dosyası</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="mt-1 block w-full cursor-pointer text-[11px] text-foreground file:mr-2 file:rounded file:border-0 file:bg-surface-secondary file:px-2 file:py-1"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file?.type.startsWith("image/")) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          const r = reader.result;
                          if (typeof r !== "string") return;
                          updateSelectedFull((f) => ({
                            ...f,
                            imageDataUrl: r,
                          }));
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                  <div>
                    <span className="text-xs text-muted">Kutuya yerleştirme</span>
                    <p className="mt-0.5 text-[10px] leading-snug text-muted">
                      Çerçeveyi sürükleyerek her yandan büyütüp küçültebilirsiniz — köşeden ikisi birden ölçeklenir.
                    </p>
                    <div className="mt-1.5 flex flex-col gap-1.5">
                      {(
                        [
                          ["contain", "Sığdır — taşmayı önler, kenar boşluğu kalabilir"],
                          ["cover", "Kapla — kutuyu doldurur, taşan kırpılır"],
                          ["fill", "Ger — çerçeveyi doldurmak için oranı esnet"],
                        ] as const
                      ).map(([value, hint]) => (
                        <label
                          key={value}
                          className="flex cursor-pointer items-start gap-2 rounded-md border-[0.5px] border-border/40 bg-surface-secondary/45 px-2 py-1.5 text-[11px] text-foreground"
                        >
                          <input
                            type="radio"
                            name={`imgfit-${selected.id}`}
                            className="mt-0.5 accent-accent"
                            checked={
                              normalizeImageObjectFit(selected.imageObjectFit) ===
                              value
                            }
                            onChange={() =>
                              updateSelectedFull((f) =>
                                isImageKind(f)
                                  ? { ...f, imageObjectFit: value }
                                  : f,
                              )
                            }
                          />
                          <span>
                            <span className="font-medium capitalize">
                              {value === "contain"
                                ? "Sığdır"
                                : value === "cover"
                                  ? "Kapla"
                                  : "Ger"}
                            </span>
                            <span className="block text-[10px] text-muted">{hint}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <label className="block pt-2">
                    <span className="text-xs text-muted">
                      Köşe yuvarlaklığı (px)
                    </span>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={40}
                        step={1}
                        value={normalizeImageBorderRadiusPx(
                          selected.imageBorderRadiusPx,
                        )}
                        className="h-2 min-w-[7rem] flex-1 accent-[var(--accent)]"
                        onChange={(e) =>
                          updateSelectedFull((f) =>
                            isImageKind(f)
                              ? {
                                  ...f,
                                  imageBorderRadiusPx:
                                    normalizeImageBorderRadiusPx(
                                      Number(e.target.value),
                                    ),
                                }
                              : f,
                          )
                        }
                      />
                      <span className="w-14 text-[11px] text-muted tabular-nums">
                        {
                          normalizeImageBorderRadiusPx(
                            selected.imageBorderRadiusPx,
                          )
                        }
                        px
                      </span>
                    </div>
                  </label>
                  </>
                ) : null}

                <div>
                  <span className="text-xs text-muted">Konum &amp; ölçü (%)</span>
                  <div className="mt-2 grid grid-cols-2 flex-wrap gap-2 gap-x-3">
                    {(
                      [["Sol", "left"], ["Üst", "top"], ["Genişlik", "width"], ["Yükseklik", "height"]] as const
                    ).map(([lab, key]) => (
                      <label key={key} className="min-w-[6.5rem] flex-1">
                        <span className="sr-only">{lab}</span>
                        <span className="block text-[10px] text-muted">
                          {lab}
                        </span>
                        <input
                          type="number"
                          step={0.1}
                          className="mt-0.5 w-full rounded border-[0.5px] border-border/45 bg-surface-tertiary px-1 py-0.5 text-xs text-foreground outline-none ring-offset-2 ring-offset-background focus-visible:ring-1 focus-visible:ring-accent"
                          value={
                            Math.round(Number(selected.box[key]) * 10) / 10
                          }
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (!Number.isFinite(n)) return;
                            patchSelectedBox({ [key]: n });
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </div>

                {!isImageKind(selected) ? (
                  <>
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-wrap items-center gap-4 gap-y-2">
                        <label className="flex items-center gap-1.5 text-xs text-foreground">
                          <input
                            type="checkbox"
                            className="rounded border-border bg-surface-tertiary accent-accent"
                            checked={selected.textStyle.bold}
                            onChange={(e) =>
                              updateSelectedFull((f) => ({
                                ...f,
                                textStyle: {
                                  ...f.textStyle,
                                  bold: e.target.checked,
                                },
                              }))
                            }
                          />
                          Kalın
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-foreground">
                          <input
                            type="checkbox"
                            className="rounded border-border bg-surface-tertiary accent-accent"
                            checked={selected.textStyle.italic}
                            onChange={(e) =>
                              updateSelectedFull((f) => ({
                                ...f,
                                textStyle: {
                                  ...f.textStyle,
                                  italic: e.target.checked,
                                },
                              }))
                            }
                          />
                          İtalik
                        </label>
                      </div>
                      <ColorFieldNative
                        key={selected.id}
                        idSuffix={`side-${selected.id}`}
                        value={canonicalHexForColorInput(
                          selected.textStyle.color,
                        )}
                        onCommit={(hex) =>
                          updateSelectedFull((f) => ({
                            ...f,
                            textStyle: {
                              ...f.textStyle,
                              color: canonicalHexForColorInput(hex),
                            },
                          }))
                        }
                      />
                    </div>

                    <label className="block">
                      <span className="text-xs text-muted">
                        Yazı boyutu (% · yaklaşık punto)
                      </span>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <input
                          type="range"
                          min={45}
                          max={200}
                          value={selected.textStyle.scalePct}
                          className="h-2 min-w-[7rem] flex-1 accent-[var(--accent)]"
                          onChange={(e) =>
                            updateSelectedFull((f) => ({
                              ...f,
                              textStyle: {
                                ...f.textStyle,
                                scalePct: Number(e.target.value),
                              },
                            }))
                          }
                        />
                        <span className="w-12 text-[11px] text-muted">
                          {selected.textStyle.scalePct}%
                        </span>
                      </div>
                    </label>
                  </>
                ) : null}

                <Button
                  variant="danger-soft"
                  fullWidth
                  className="py-2 text-xs"
                  onPress={removeSelectedField}
                >
                  Bu kutuyu kaldır
                </Button>
              </div>
            ) : (
              <p className="border-t border-border pt-4 text-xs leading-relaxed text-muted">
                Soldaki tasarımda bir çerçeveye tıklayınca seçim yapılır; satır başındaki sıra ile de eşleştirebilirsiniz.
              </p>
            )}

            <div
              className="border-t border-border/50 pt-4"
              role="region"
              aria-labelledby="studio-shortcuts-title"
            >
              <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                <Keyboard className="size-3.5 text-accent/90" aria-hidden />
                <span id="studio-shortcuts-title">Hızlı kısayollar</span>
              </div>
              <dl className="grid gap-y-2 text-[11px] leading-snug">
                <div className="flex justify-between gap-3 rounded-lg bg-background/55 px-2.5 py-1.5 ring-1 ring-border/35">
                  <dt className="font-mono text-muted">Ctrl+S</dt>
                  <dd className="text-right text-foreground/90">Kaydet</dd>
                </div>
                <div className="flex justify-between gap-3 rounded-lg bg-background/55 px-2.5 py-1.5 ring-1 ring-border/35">
                  <dt className="font-mono text-muted">Ctrl+Z / ⇧Ctrl+Z</dt>
                  <dd className="text-right text-foreground/90">Geri / İleri</dd>
                </div>
                <div className="flex justify-between gap-3 rounded-lg bg-background/55 px-2.5 py-1.5 ring-1 ring-border/35">
                  <dt className="font-mono text-muted">Del</dt>
                  <dd className="text-right text-foreground/90">Seçili kutuyu kaldır</dd>
                </div>
                <div className="flex justify-between gap-3 rounded-lg bg-background/55 px-2.5 py-1.5 ring-1 ring-border/35">
                  <dt className="font-mono text-muted">Ctrl+D</dt>
                  <dd className="text-right text-foreground/90">Çoğalt</dd>
                </div>
                <div className="flex justify-between gap-3 rounded-lg bg-background/55 px-2.5 py-1.5 ring-1 ring-border/35">
                  <dt className="font-mono text-muted">Ctrl+C / Ctrl+V</dt>
                  <dd className="text-right text-foreground/90">Alan kopyala / yapıştır</dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      </section>
      </>
    );
  }

  return (
    <>
      <DialogOutlet />
    <div className="space-y-10">
      <header className="relative overflow-hidden rounded-2xl border-[0.5px] border-border/40 bg-gradient-to-b from-surface-secondary/55 via-surface-secondary/25 to-transparent px-5 py-7 shadow-sm shadow-black/12 sm:px-7 sm:py-8">
        <div
          className="pointer-events-none absolute -right-12 -top-24 h-48 w-48 rounded-full bg-accent/15 blur-3xl"
          aria-hidden
        />
        <div className="relative">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
            Yerel · Gizlilik öncelikli
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Şablonlarınız
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Arka plan görseli yükleyin, metin kutularını yerleştirin; PDF veya Word
            çıktısı alın. Veriler yalnızca bu projedeki{" "}
            <code className="rounded bg-surface-secondary px-1 py-0.5 font-mono text-[11px] text-foreground/90">
              data/templates.json
            </code>{" "}
            dosyasında tutulur; klasörü veya JSON yedeğini başka bir makinedeki projeye de
            taşıyabilirsiniz.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          isDisabled={busy}
          className="shadow-md shadow-accent/20"
          onPress={() => startNewTemplate()}
        >
          Yeni şablon (görsel seç)
        </Button>
        <Button
          variant="outline"
          isDisabled={busy}
          onPress={() => swallowAsync(() => exportJson())}
        >
          Dışa aktar (JSON)
        </Button>
        <Button
          variant="outline"
          isDisabled={busy}
          className="inline-flex items-center gap-2"
          onPress={() =>
            swallowAsync(() => router.push("/gecmis-doldurmalar"))
          }
        >
          <History className="size-[1.125rem] shrink-0" strokeWidth={2} aria-hidden />
          Geçmiş
        </Button>
        <Button
          variant="secondary"
          isDisabled={busy}
          onPress={() => importJsonInputRef.current?.click()}
        >
          İçe aktar
        </Button>
        <input
          ref={importJsonInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importJson(f);
            e.target.value = "";
          }}
        />
      </div>

      {recentCards.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Son kullanılan
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentCards.map((t) => (
              <Card.Root
                key={t.id}
                className="border-[0.5px] border-border/45 shadow-sm shadow-black/12 transition-colors hover:border-accent/25"
              >
                <Card.Header className="gap-1">
                  <Card.Title className="truncate text-base">{t.name}</Card.Title>
                  <Card.Description className="text-[11px]">
                    {new Date(t.updatedAt).toLocaleString()}
                  </Card.Description>
                </Card.Header>
                <Card.Content className="flex flex-wrap gap-2 pb-4">
                  <Button
                    variant="primary"
                    size="sm"
                    onPress={() => navigateToFill(t.id)}
                  >
                    Doldur
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() => navigateToEdit(t.id)}
                  >
                    Kutuları düzenle
                  </Button>
                </Card.Content>
              </Card.Root>
            ))}
          </div>
          <Separator />
        </section>
      ) : null}

      {list.length === 0 ? (
        <Card.Root className="rounded-2xl border-[0.5px] border-border/45 bg-surface-secondary/25 shadow-sm shadow-black/15">
          <Card.Content className="py-12 text-center text-sm text-muted">
            Henüz şablon yok. Yukarıdan görsel seçerek başlayın.
          </Card.Content>
        </Card.Root>
      ) : (
        <Card.Root className="overflow-hidden rounded-2xl border-[0.5px] border-border/45 shadow-sm shadow-black/15">
          <ul className="divide-border divide-y">
            {list.map((t) => (
              <li
                key={t.id}
                className="hover:bg-surface-secondary/40 flex flex-wrap items-center gap-3 px-4 py-3 transition-colors"
              >
                <span className="min-w-[8rem] flex-1 font-medium text-foreground">
                  {t.name}
                </span>
                <span className="text-xs text-muted">
                  {new Date(t.updatedAt).toLocaleString()}
                </span>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onPress={() => navigateToFill(t.id)}
                  >
                    Doldur
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() => navigateToEdit(t.id)}
                  >
                    Kutuları düzenle
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    isDisabled={busy}
                    onPress={() => swallowAsync(() => duplicateTemplate(t))}
                  >
                    Çoğalt
                  </Button>
                  <Button
                    variant="danger-soft"
                    size="sm"
                    isDisabled={busy}
                    onPress={() => swallowAsync(() => removeTemplate(t.id))}
                  >
                    Sil
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card.Root>
      )}
    </div>
    </>
  );
}
