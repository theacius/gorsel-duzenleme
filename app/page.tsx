import { MainShell } from "@/components/MainShell";
import { TemplateStudio } from "@/components/TemplateStudio";

export default function Home() {
  return (
    <MainShell>
      <TemplateStudio embedded="list" />
    </MainShell>
  );
}
