"use client";

import { FIELD_PLAIN_TEXT_CLASS } from "@/components/field-overlay-shared";
import { fieldTextLineShellStyle } from "@/lib/overlay-geometry";
import {
  fieldLineHeightPx,
  fieldTextStyleCss,
  type TeklifField,
} from "@/lib/teklif-fields";
import type { CSSProperties } from "react";

const COMMON = `${FIELD_PLAIN_TEXT_CLASS} block w-full max-w-full bg-transparent autofill:shadow-[inset_0_0_0px_1000px_transparent] autofill:[-webkit-text-fill-color:inherit]`;

function singleLineText(s: string): string {
  return s.replace(/\r\n|\r|\n/g, " ").replace(/ +/g, " ");
}

export function FieldOverlayInput({
  field,
  shellW,
  shellH,
  value,
  onChange,
  readOnly = false,
}: {
  field: TeklifField;
  shellW: number;
  shellH: number;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  const lhBase = fieldLineHeightPx(field);
  const roomyLine = lhBase + 4;
  const textStyleCss: CSSProperties = fieldTextStyleCss(field);
  const shellStyle: CSSProperties = {
    ...fieldTextLineShellStyle(field, shellW, shellH),
    backgroundColor: "transparent",
    border: "none",
    outline: "none",
    boxShadow: "none",
  };

  return (
    <div
      style={shellStyle}
      className="bg-transparent ring-0 outline-none shadow-none ring-offset-0 ring-offset-transparent"
    >
      <input
        type="text"
        readOnly={readOnly}
        tabIndex={readOnly ? -1 : undefined}
        data-teklif-field-id={field.id}
        aria-label={field.label}
        placeholder={field.label}
        value={value}
        onChange={(e) =>
          readOnly ? undefined : onChange(singleLineText(e.target.value))
        }
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        inputMode="text"
        className={`${COMMON} ${readOnly ? "cursor-default select-text" : ""}`}
        style={{
          ...textStyleCss,
          appearance: "none",
          WebkitAppearance: "none",
          backgroundColor: "transparent",
          padding: 0,
          margin: 0,
          border: "none",
          borderRadius: 0,
          outline: "none",
          boxSizing: "border-box",
          display: "block",
          alignSelf: "stretch",
          flexShrink: 0,
          flexGrow: 0,
          width: "100%",
          minWidth: 0,
          height: roomyLine,
          minHeight: roomyLine,
          maxHeight: roomyLine,
          lineHeight: `${roomyLine}px`,
          whiteSpace: "nowrap",
          wordBreak: "normal",
          overflowWrap: "normal",
          textOverflow: "clip",
          overflow: "hidden",
        }}
      />
    </div>
  );
}
