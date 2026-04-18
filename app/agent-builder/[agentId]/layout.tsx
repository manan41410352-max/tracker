import SetupRequired from "@/components/setup/SetupRequired";
import { getSetupStatus } from "@/lib/app-config";

export default function AgentBuilderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const setup = getSetupStatus();

  if (!setup.builderReady) {
    return (
      <SetupRequired
        title="Connect Convex before opening the agent builder"
        description="The visual builder needs database access to load your saved workflow, nodes, and edges."
        missingGroups={setup.missingGroups.filter((group) =>
          ["database"].includes(group.id)
        )}
      />
    );
  }

  return <>{children}</>;
}
