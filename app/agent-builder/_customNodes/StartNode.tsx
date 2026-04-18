import { Handle, Position } from "@xyflow/react";
import { Play } from "lucide-react";
import React from "react";

import { NODE_STYLE_MAP } from "@/lib/agent-builder";

function StartNode({ data }: any) {
  return (
    <div className="rounded-2xl border border-border bg-card p-2 px-3 shadow-sm dark:border-slate-800/80 dark:bg-slate-950/95 dark:shadow-black/20">
      <div className="flex items-center gap-2">
        <Play
          className="h-8 w-8 rounded-lg p-2"
          style={{
            backgroundColor: data?.bgColor || NODE_STYLE_MAP.start.bgColor,
          }}
        />
        <h2 className="text-foreground">{data?.label || "Start"}</h2>
        <Handle type="source" position={Position.Right} />
      </div>
    </div>
  );
}

export default StartNode;
