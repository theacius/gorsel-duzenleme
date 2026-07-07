import { FillHistoryList } from "@/components/FillHistoryList";
import { MainShell } from "@/components/MainShell";

export default function GecmisDoldurmalarPage() {
  return (
    <MainShell>
      <div className="space-y-8">
        <header className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
            Arşiv
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Geçmiş
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted">
            PDF veya Word indirdiğinizde o andaki metinler burada saklanır (bu
            tarayıcı). Şablon hâlâ projede varsa tam önizleme; yoksa yalnızca
            metin listesi gösterilir.
          </p>
        </header>
        <FillHistoryList />
      </div>
    </MainShell>
  );
}
