"use client";

import { Layers3, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Props = {
  blockCount: number;
  paletteOpen: boolean;
  onOpenPalette: () => void;
};

function BuilderSidebar({ blockCount, paletteOpen, onOpenPalette }: Props) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-3xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-700 dark:text-cyan-200">
          <Layers3 className="size-5" />
        </div>
        <Badge variant="outline" className="bg-background">
          {blockCount}
        </Badge>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">Blocks</p>
        <p className="text-xs leading-5 text-muted-foreground">
          Keep only the workflow blocks docked here. Open the floating palette when
          you want to drag new nodes onto the canvas.
        </p>
      </div>

      <Button className="mt-auto w-full" onClick={onOpenPalette}>
        {paletteOpen ? (
          <PanelLeftClose className="mr-1 size-4" />
        ) : (
          <PanelLeftOpen className="mr-1 size-4" />
        )}
        {paletteOpen ? "Show blocks" : "Open blocks"}
      </Button>
    </div>
  );
}

export default BuilderSidebar;
