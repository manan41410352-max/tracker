import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import React from "react";

import AppHeader from "./_components/AppHeader";
import AppSidebar from "./_components/AppSidebar";

function DashboardProvider({ children }: any) {
  return (
    <SidebarProvider>
      <div className="app-shell flex min-h-screen w-full">
        <AppSidebar />
        <SidebarInset className="min-h-screen bg-transparent">
          <AppHeader />
          <div className="flex-1 px-4 pb-10 pt-6 sm:px-6 lg:px-8">{children}</div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export default DashboardProvider;
