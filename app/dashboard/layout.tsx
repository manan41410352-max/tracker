import SetupRequired from "@/components/setup/SetupRequired";
import { getSetupStatus } from "@/lib/app-config";

import DashboardProvider from "./Provider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const setup = getSetupStatus();

  if (!setup.dashboardReady) {
    return (
        <SetupRequired
          title="Connect Convex before opening the dashboard"
          description="The dashboard needs database connectivity to load your local workspace and saved system maps."
          missingGroups={setup.missingGroups.filter((group) =>
            ["database"].includes(group.id)
          )}
        />
    );
  }

  return <DashboardProvider>{children}</DashboardProvider>;
}
