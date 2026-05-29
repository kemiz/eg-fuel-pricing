import { getAskBriefing, getSites } from "@/lib/data/server";
import { PageHeader } from "@/components/ui";
import { AskAssistant } from "@/components/assistant/AskAssistant";

export const dynamic = "force-dynamic";

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [sites, briefing, sp] = await Promise.all([
    getSites(),
    getAskBriefing(),
    searchParams,
  ]);

  return (
    <div className="flex h-[calc(100vh-9.5rem)] flex-col gap-5">
      <PageHeader
        eyebrow="Live data assistant"
        title="Ask EG"
        description="Conversational pricing analyst over the EG forecourt network. It answers with inline charts, KPI cards and clickable site / region drill-downs — and can convene the pricing agents on demand."
      />
      <div className="min-h-0 flex-1">
        <AskAssistant
          sites={sites}
          initialQuery={sp.q}
          fill
          briefing={briefing}
          suggestions={[
            "Which regions have the strongest margins right now?",
            "Where are we priced above our local competitors?",
            "Break the network down: cheaper vs in-line vs dearer than rivals",
            "Compare US and UK average margins",
            "Optimise the regular price for Cumberland Farms Orlando",
          ]}
        />
      </div>
    </div>
  );
}
