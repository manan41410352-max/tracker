"use client";

import ThemeToggle from "@/components/theme/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { FolderKanban, Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";
import React from "react";

const pageMeta: Record<
  string,
  { title: string; description: string; eyebrow: string }
> = {
  "/dashboard": {
    title: "Systematic Tracker",
    description: "Map your life domains, find constraints, and choose the next leverage point.",
    eyebrow: "Life system overview",
  },
  "/dashboard/my-agents": {
    title: "Saved System Maps",
    description: "Browse every saved tracker map in this workspace.",
    eyebrow: "System library",
  },
  "/dashboard/leaderboard": {
    title: "Leaderboard Workspace",
    description: "Open workflow systems, preview them live, and compare leaderboard standings.",
    eyebrow: "Leaderboard view",
  },
  "/dashboard/player": {
    title: "Leaderboard Workspace",
    description: "Open workflow systems, preview them live, and compare leaderboard standings.",
    eyebrow: "Leaderboard view",
  },
  "/dashboard/admin": {
    title: "Admin Workspace",
    description: "Inspect every person, player system, run, and reusable memory record.",
    eyebrow: "Admin view",
  },
};

function AppHeader() {
  const pathname = usePathname();
  const meta = pageMeta[pathname] ?? {
    title: "Systematic Tracker",
    description: "Manage your tracker maps from one place.",
    eyebrow: "Life system overview",
  };

  return (
    <header className="sticky top-0 z-20 px-4 pt-4 sm:px-6">
      <div className="app-panel-strong rounded-[1.75rem] px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <SidebarTrigger className="mt-0.5 rounded-full border border-white/40 bg-white/60 shadow-sm backdrop-blur hover:bg-white dark:border-sky-400/15 dark:bg-slate-950/55 dark:hover:bg-slate-900" />
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="app-chip rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-sky-700 hover:bg-transparent dark:text-sky-200">
                  {meta.eyebrow}
                </Badge>
                <Badge
                  variant="outline"
                  className="rounded-full border-emerald-400/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                >
                  Local workspace
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  {meta.title}
                </h1>
                <div className="app-chip inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-muted-foreground">
                  <Sparkles className="size-3.5 text-sky-500" />
                  Cascade-inspired planner
                </div>
              </div>

              <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                {meta.description}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 self-end lg:self-auto">
            <div className="app-chip flex items-center gap-3 rounded-full px-4 py-2 text-xs text-muted-foreground">
              <div className="flex size-8 items-center justify-center rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-200">
                <FolderKanban className="size-4" />
              </div>
              <div>
                <p className="font-medium text-foreground">Workspace ready</p>
                <p className="text-[11px] text-muted-foreground">
                  Local tracker runtime enabled
                </p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}

export default AppHeader;
