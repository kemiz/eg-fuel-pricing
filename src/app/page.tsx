import { getAskBriefing, getSites } from "@/lib/data/server";
import { AskAssistant } from "@/components/assistant/AskAssistant";

export const dynamic = "force-dynamic";

export default async function HomePage({
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
    <div className="h-full">
      <AskAssistant
        sites={sites}
        initialQuery={sp.q}
        fill
        briefing={briefing}
        persistKey="home"
        suggestions={[
          "Which regions have the strongest margins right now?",
          "Where are we priced above our local competitors?",
          "Break the network down: cheaper vs in-line vs dearer than rivals",
          "Compare US and UK average margins",
          "Optimise the regular price for Cumberland Farms Orlando",
        ]}
      />
    </div>
  );
}
