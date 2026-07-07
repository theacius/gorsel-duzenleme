import { MainShell } from "@/components/MainShell";
import { TemplateStudio } from "@/components/TemplateStudio";

export default function StudioNewPage() {
  return (
    <MainShell wide>
      <TemplateStudio embedded="new" />
    </MainShell>
  );
}
