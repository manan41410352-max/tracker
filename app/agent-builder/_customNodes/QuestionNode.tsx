import React from "react";
import { Handle, Position } from "@xyflow/react";
import { ListChecks } from "lucide-react";

function QuestionNode({ data }: any) {
  const responseType =
    data?.settings?.responseType === "mcq" ? "MCQ question" : "Short answer";
  const optionCount = Array.isArray(data?.settings?.options)
    ? data.settings.options.length
    : 0;

  return (
    <div className="min-w-[220px] rounded-2xl border border-border bg-card p-3 shadow-sm dark:border-slate-800/80 dark:bg-slate-950/95 dark:shadow-black/20">
      <div className="flex items-start gap-3">
        <ListChecks
          className="mt-0.5 h-9 w-9 rounded-xl p-2"
          style={{
            backgroundColor: data?.bgColor,
          }}
        />
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">{data?.label}</h2>
          <p className="text-xs text-muted-foreground">{responseType}</p>
          {optionCount ? (
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {optionCount} option{optionCount > 1 ? "s" : ""}
            </p>
          ) : null}
        </div>
      </div>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export default QuestionNode;
