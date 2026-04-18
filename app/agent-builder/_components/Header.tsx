"use client";

import ThemeToggle from "@/components/theme/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Agent } from "@/types/AgentType";
import {
  ChevronLeft,
  Code2,
  Play,
  Sparkles,
  Trophy,
  Trash2,
  type LucideIcon,
  X,
} from "lucide-react";
import Link from "next/link";
import React from "react";

type Props = {
  agentDetail: Agent | undefined;
  previewHeader?: boolean;
  onPublish: () => void;
  onOpenCode: () => void;
  onDelete?: () => void;
  onPreview?: () => void;
  publishDisabled?: boolean;
  deleteDisabled?: boolean;
  publishLabel?: string;
  publishIcon?: LucideIcon;
};

function Header({
  agentDetail,
  previewHeader = false,
  onPublish,
  onOpenCode,
  onDelete,
  onPreview,
  publishDisabled = false,
  deleteDisabled = false,
  publishLabel = "Leaderboard",
  publishIcon: PublishIcon = Trophy,
}: Props) {
  const builderHref = agentDetail?.agentId
    ? `/agent-builder/${agentDetail.agentId}`
    : "/dashboard/my-agents";
  const backHref = previewHeader ? builderHref : "/dashboard/my-agents";

  return (
    <div className="px-4 pt-4 sm:px-6">
      <div className="app-panel-strong rounded-[1.85rem] px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="rounded-full border border-white/40 bg-white/60 shadow-sm hover:bg-white dark:border-sky-400/15 dark:bg-slate-950/55 dark:hover:bg-slate-900"
            >
              <Link href={backHref}>
                <ChevronLeft className="h-5 w-5" />
              </Link>
            </Button>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="app-chip rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-sky-700 hover:bg-transparent dark:text-sky-200">
                  {previewHeader ? "Runtime preview" : "Workflow builder"}
                </Badge>
                <Badge variant="outline" className="rounded-full bg-background/70">
                  {agentDetail?.published ? "Published" : "Draft"}
                </Badge>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
                  {agentDetail?.name || "Agent Builder"}
                </h2>
                <div className="app-chip inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-muted-foreground">
                  <Sparkles className="size-3.5 text-sky-500" />
                  {previewHeader ? "Test the live runtime" : "Design the flow visually"}
                </div>
              </div>

              <p className="mt-1 text-sm text-muted-foreground">
                {previewHeader
                  ? "Preview the runtime, inspect workflow state, and test conversations with the active workflow."
                  : "Research, design, and wire the workflow visually before moving into preview."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" onClick={onOpenCode} className="rounded-full">
              <Code2 />
              Code
            </Button>
            {!previewHeader ? (
              onPreview ? (
                <Button onClick={onPreview} className="rounded-full shadow-lg shadow-sky-500/20">
                  <Play />
                  Preview
                </Button>
              ) : (
                <Button asChild className="rounded-full shadow-lg shadow-sky-500/20">
                  <Link href={`${builderHref}/preview`}>
                    <Play />
                    Preview
                  </Link>
                </Button>
              )
            ) : (
              <Button asChild variant="outline" className="rounded-full">
                <Link href={builderHref}>
                  <X />
                  Close Preview
                </Link>
              </Button>
            )}

            <Button
              onClick={onPublish}
              disabled={publishDisabled}
              className="rounded-full shadow-lg shadow-sky-500/20"
            >
              <PublishIcon />
              {publishDisabled ? "Working..." : publishLabel}
            </Button>

            {onDelete ? (
              <Button
                variant="destructive"
                onClick={onDelete}
                disabled={deleteDisabled}
                className="rounded-full"
              >
                <Trash2 />
                {deleteDisabled ? "Deleting..." : "Delete"}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Header;
