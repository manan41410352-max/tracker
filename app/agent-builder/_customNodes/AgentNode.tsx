import React from "react";
import { Handle, Position } from "@xyflow/react";
import { MousePointer2 } from "lucide-react";

import { NODE_STYLE_MAP } from "@/lib/agent-builder";

function AgentNode({ data }: any) {
  const emoji = typeof data?.emoji === "string" ? data.emoji.trim() : "";
  const bgColor = data?.bgColor || NODE_STYLE_MAP.AgentNode.bgColor;

  return (
    <div className="rounded-2xl border border-border bg-card p-2 px-3 shadow-sm dark:border-slate-800/80 dark:bg-slate-950/95 dark:shadow-black/20">
      <div className="flex items-center gap-2">
        {emoji ? (
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-lg"
            style={{ backgroundColor: bgColor }}
          >
            {emoji}
          </span>
        ) : (
          <MousePointer2
            className="h-8 w-8 rounded-lg p-2"
            style={{
              backgroundColor: bgColor,
            }}
          />
        )}
        <div className="flex flex-col">
          <h2 className="text-foreground">{data?.label}</h2>
          <p className="text-xs text-muted-foreground">Agent</p>
        </div>
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
      </div>
    </div>
  );
}

export default AgentNode;
