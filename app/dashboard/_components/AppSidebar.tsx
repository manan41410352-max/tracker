"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useContext, useEffect, useState } from "react";
import { useConvex } from "convex/react";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  FolderKanban,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
  Trophy,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { api } from "@/convex/_generated/api";
import { UserDetailContext } from "@/context/UserDetailContext";

const menuOptions = [
  { title: "Overview", url: "/dashboard", icon: LayoutDashboard },
  { title: "Leaderboard", url: "/dashboard/leaderboard", icon: Trophy },
  { title: "Admin", url: "/dashboard/admin", icon: ShieldCheck },
  { title: "Saved Systems", url: "/dashboard/my-agents", icon: FolderKanban },
];

function AppSidebar() {
  const { open } = useSidebar();
  const path = usePathname();
  const convex = useConvex();
  const userContext = useContext(UserDetailContext);
  const [agentCount, setAgentCount] = useState(0);

  if (!userContext) return null;

  const { userDetail } = userContext;

  useEffect(() => {
    if (!userDetail?._id) return;

    const fetchUserAgents = async () => {
      const agents = await convex.query(api.agent.GetUserAgents, {
        userId: userDetail._id,
      });

      setAgentCount(agents?.length ?? 0);
    };

    void fetchUserAgents();
  }, [convex, userDetail]);

  const isActiveItem = (url: string) => {
    if (url === "/dashboard") {
      return path === "/dashboard";
    }

    if (url === "/dashboard/leaderboard") {
      return path === "/dashboard/leaderboard" || path === "/dashboard/player";
    }

    return path === url;
  };

  return (
    <Sidebar collapsible="icon" variant="floating">
      <SidebarHeader className="p-3">
        <Link
          href="/dashboard"
          className="app-hero-card flex items-center gap-3 rounded-[1.65rem] p-3 transition hover:-translate-y-[1px]"
        >
          <div className="flex size-12 items-center justify-center rounded-2xl bg-slate-950/90 shadow-lg shadow-sky-500/10 dark:bg-sky-500/14 dark:ring-1 dark:ring-sky-400/20">
            <Image src="/logo.svg" alt="logo" width={24} height={24} />
          </div>
          {open && (
            <div className="space-y-0.5">
              <p className="font-semibold text-slate-900 dark:text-slate-50">Systematic Tracker</p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Life operating workspace
              </p>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Navigate
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuOptions.map((menu) => (
                <SidebarMenuItem key={menu.url}>
                  <SidebarMenuButton
                    asChild
                    size={open ? "lg" : "default"}
                    isActive={isActiveItem(menu.url)}
                    tooltip={menu.title}
                    className="rounded-2xl data-[active=true]:border data-[active=true]:border-sky-400/20 data-[active=true]:bg-sky-500/12 data-[active=true]:text-sky-900 dark:data-[active=true]:bg-sky-500/10 dark:data-[active=true]:text-sky-100"
                  >
                    <Link href={menu.url}>
                      <menu.icon />
                      <span>{menu.title}</span>
                      {open && menu.url === "/dashboard/my-agents" ? (
                        <Badge
                          variant="outline"
                          className="ml-auto rounded-full bg-background/70 text-[11px]"
                        >
                          {agentCount}
                        </Badge>
                      ) : null}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 pt-0">
        <div className="app-panel rounded-[1.6rem] p-4">
          <div className="flex items-center gap-2">
            <div className="flex size-10 items-center justify-center rounded-xl bg-sky-500/12 text-sky-700 dark:text-sky-200">
              <Bot className="size-4" />
            </div>
            {open && (
              <div>
                <p className="text-sm font-medium text-foreground">Local runtime</p>
                <p className="text-xs text-muted-foreground">
                  Map, prioritize, and refine
                </p>
              </div>
            )}
          </div>

          {open && (
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-white/40 bg-white/55 p-3 dark:border-slate-800 dark:bg-slate-950/70">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Saved systems
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-foreground">
                      {agentCount}
                    </p>
                  </div>
                  <div className="flex size-10 items-center justify-center rounded-xl bg-amber-400/14 text-amber-700 dark:text-amber-200">
                    <Sparkles className="size-4" />
                  </div>
                </div>
              </div>
              <Link
                href="/dashboard"
                className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg shadow-sky-500/20 transition hover:opacity-95"
              >
                <Sparkles className="size-4" />
                Create new system map
              </Link>
            </div>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppSidebar;
