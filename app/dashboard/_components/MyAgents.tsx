"use client";

import Link from "next/link";
import moment from "moment";
import React from "react";
import { useQuery } from "convex/react";
import {
  ArrowRight,
  Bot,
  GitBranchPlus,
  Layers3,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import { Agent } from "@/types/AgentType";

function MyAgents() {
  const agentList = useQuery(api.agent.GetWorkspaceAgents, {});

  if (agentList === undefined) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="app-panel h-48 animate-pulse rounded-[1.75rem]"
          />
        ))}
      </div>
    );
  }

  if (agentList.length === 0) {
    return (
      <Card className="app-panel rounded-[1.75rem] border-dashed shadow-none">
        <CardContent className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-white/80 shadow-sm dark:bg-slate-900/80 dark:shadow-black/20">
            <Bot className="size-6 text-sky-700 dark:text-sky-300" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              No system maps yet
            </h3>
            <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
              Create your first tracker map to connect sleep, energy, focus,
              work, money, relationships, health, and small jobs.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {agentList.map((agent: Agent) => (
        <Link href={`/agent-builder/${agent.agentId}`} key={agent._id}>
          <Card className="app-metric-card h-full rounded-[1.75rem] transition duration-200 hover:-translate-y-1">
            <CardHeader className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 shadow-sm dark:bg-amber-500/12 dark:text-amber-200">
                  <GitBranchPlus className="size-5" />
                </div>
                <Badge
                  variant="outline"
                  className="rounded-full bg-white/70 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300"
                >
                  {agent.published ? "Published" : "Draft"}
                </Badge>
              </div>

              <div className="space-y-1">
                <CardTitle className="line-clamp-1 text-lg">{agent.name}</CardTitle>
                <CardDescription className="leading-6">
                  {(agent.nodes?.length ?? 0) > 0
                    ? `${agent.nodes?.length ?? 0} nodes configured`
                    : "Legacy map imported into this workspace"}
                </CardDescription>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge className="app-chip rounded-full px-3 py-1 text-[11px] font-medium text-slate-700 hover:bg-transparent dark:text-slate-200">
                  <Layers3 className="mr-1 size-3.5" />
                  {(agent.nodes?.length ?? 0) > 0
                    ? `${agent.nodes?.length ?? 0} nodes`
                    : "Legacy flow"}
                </Badge>
                <Badge className="app-chip rounded-full px-3 py-1 text-[11px] font-medium text-sky-700 hover:bg-transparent dark:text-sky-200">
                  <Sparkles className="mr-1 size-3.5" />
                  Ready to edit
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
              <span>{moment(agent._creationTime).fromNow()}</span>
              <span className="inline-flex items-center gap-1 font-medium text-slate-900 dark:text-slate-100">
                Open
                <ArrowRight className="size-4" />
              </span>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export default MyAgents;
