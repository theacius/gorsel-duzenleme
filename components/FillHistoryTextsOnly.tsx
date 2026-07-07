"use client";

import type { FillHistoryEntry } from "@/lib/fill-history";

/** Şablon sunucuda yoksa yalnızca saklı metinleri tabloda gösterir. */
export function FillHistoryTextsOnly({ entry }: { entry: FillHistoryEntry }) {
  const rows =
    entry.fieldsMeta.length > 0
      ? entry.fieldsMeta.map((m) => ({
          id: m.id,
          label: m.label || "Etiketsiz",
          value: entry.values[m.id] ?? "",
        }))
      : Object.entries(entry.values).map(([id, value]) => ({
          id,
          label: id,
          value,
        }));

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface-secondary/35">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-secondary/55">
            <th className="px-4 py-2.5 font-medium text-foreground">
              Etiket
            </th>
            <th className="px-4 py-2.5 font-medium text-foreground">Metin</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.id + String(i)}
              className="border-border/70 border-t hover:bg-surface-secondary/45"
            >
              <td className="max-w-[10rem] px-4 py-2.5 align-top text-xs text-muted">
                {r.label}
              </td>
              <td className="px-4 py-2.5 text-foreground">
                {r.value || (
                  <span className="text-muted italic">(boş)</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
