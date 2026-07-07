import { FillHistoryDetail } from "@/components/FillHistoryDetail";
import { MainShell } from "@/components/MainShell";

type PageProps = { params: Promise<{ entryId: string }> };

export default async function GecmisDoldurmaDetayPage({ params }: PageProps) {
  const { entryId } = await params;
  return (
    <MainShell>
      <FillHistoryDetail entryId={entryId} />
    </MainShell>
  );
}
