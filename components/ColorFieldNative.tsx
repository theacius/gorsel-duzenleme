"use client";

import { canonicalHexForColorInput } from "@/lib/teklif-fields";
import { useEffect, useState } from "react";

export function ColorFieldNative({
  value,
  onCommit,
  idSuffix,
}: {
  value: string;
  onCommit: (hex: string) => void;
  idSuffix?: string;
}) {
  const safe = canonicalHexForColorInput(value);
  const id = idSuffix ?? "clr";
  const [hexDraft, setHexDraft] = useState(safe);

  useEffect(() => {
    setHexDraft(canonicalHexForColorInput(value));
  }, [value]);

  const apply = (raw: string) => {
    onCommit(canonicalHexForColorInput(raw));
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label
        htmlFor={`${id}-picker`}
        className="flex flex-col gap-1 text-xs text-slate-500"
      >
        Renk
        <input
          id={`${id}-picker`}
          type="color"
          value={safe}
          onChange={(e) => {
            const v = e.target.value;
            setHexDraft(v.toLowerCase());
            apply(v);
          }}
          className="box-border h-10 w-24 min-w-[5.5rem] cursor-pointer rounded border border-slate-400 bg-white p-1 shadow-inner"
        />
      </label>
      <label
        htmlFor={`${id}-hex`}
        className="flex flex-col gap-1 text-xs text-slate-500"
      >
        Hex
        <input
          id={`${id}-hex`}
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          value={hexDraft}
          onChange={(e) => setHexDraft(e.target.value)}
          onBlur={() => apply(hexDraft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          className="box-border w-28 rounded border border-slate-400 bg-white px-2 py-2 font-mono text-sm text-black shadow-inner outline-none focus:ring-2 focus:ring-sky-500/50"
        />
      </label>
    </div>
  );
}
