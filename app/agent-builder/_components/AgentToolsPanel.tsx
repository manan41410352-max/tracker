import React, { useContext } from "react";

import { WorkflowContext } from "@/context/WorkflowContext";
import {
  createTrackerPresetNode,
  getManualNodePresets,
} from "@/lib/tracker-workflow";

export const MANUAL_NODE_DRAG_TYPE = "application/systematic-tracker-node";

function withAlpha(hex: string, alphaHex: string) {
  return `${hex}${alphaHex}`;
}

export const MANUAL_NODE_TOOLS = getManualNodePresets();
export const MANUAL_AGENT_TOOLS = MANUAL_NODE_TOOLS;

export type ManualNodeTool = (typeof MANUAL_NODE_TOOLS)[number];

export function createPaletteNode(
  tool: ManualNodeTool,
  position = { x: 0, y: 100 }
) {
  return createTrackerPresetNode(tool.id, position);
}

type Props = {
  onAddTool?: (tool: ManualNodeTool) => void;
};

function AgentToolsPanel({ onAddTool }: Props) {
  const { setAddedNodes } = useContext(WorkflowContext);

  const onNodeToolClick = (tool: ManualNodeTool) => {
    if (onAddTool) {
      onAddTool(tool);
      return;
    }

    const nextNode = createPaletteNode(tool);
    if (!nextNode) {
      return;
    }

    setAddedNodes((prev: any) => [...prev, nextNode]);
  };

  return (
    <div>
      <h2 className="mb-1 font-semibold text-foreground">Workflow blocks</h2>
      <p className="mb-4 text-xs leading-5 text-muted-foreground">
        Click to add a block instantly, or drag it onto the canvas like n8n.
      </p>
      <div className="space-y-1">
        {MANUAL_NODE_TOOLS.map((tool) => (
          <div
            key={tool.id}
            draggable
            className="flex cursor-grab items-center gap-3 rounded-2xl border px-3 py-2.5 shadow-sm transition-transform hover:-translate-y-[1px] active:cursor-grabbing dark:shadow-black/10"
            onClick={() => onNodeToolClick(tool)}
            onDragStart={(event) => {
              event.dataTransfer.setData(
                MANUAL_NODE_DRAG_TYPE,
                JSON.stringify({ id: tool.id, type: tool.type })
              );
              event.dataTransfer.effectAllowed = "move";
            }}
            style={{
              backgroundColor: withAlpha(tool.bgColor, "1A"),
              borderColor: withAlpha(tool.bgColor, "55"),
            }}
          >
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-lg"
              style={{
                backgroundColor: tool.bgColor,
              }}
            >
              {tool.emoji || "+"}
            </span>
            <div>
              <h2 className="text-sm font-medium text-foreground">{tool.name}</h2>
              <p className="text-xs text-muted-foreground">{tool.summary}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AgentToolsPanel;
