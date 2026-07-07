"use client";

import { MainShell } from "@/components/MainShell";
import { TemplateStudio } from "@/components/TemplateStudio";
import { useParams } from "next/navigation";

export default function FillPage() {
  const p = useParams();
  const id = typeof p.templateId === "string" ? p.templateId : "";

  return (
    <MainShell wide>
      <TemplateStudio embedded="fill" routeFillId={id || null} />
    </MainShell>
  );
}
