import React from "react";
import { Handle, Position } from "@xyflow/react";
import { ShieldAlert } from "lucide-react";

function CaptchaNode({ data }: any) {
  return (
    <div className="min-w-[220px] rounded-2xl border border-border bg-card p-3 shadow-sm dark:border-slate-800/80 dark:bg-slate-950/95 dark:shadow-black/20">
      <div className="flex items-start gap-3">
        <ShieldAlert
          className="mt-0.5 h-9 w-9 rounded-xl p-2"
          style={{
            backgroundColor: data?.bgColor,
          }}
        />
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">{data?.label}</h2>
          <p className="text-xs text-muted-foreground">
            Manual verification checkpoint
          </p>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Resume after challenge clears
          </p>
        </div>
      </div>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export default CaptchaNode;
