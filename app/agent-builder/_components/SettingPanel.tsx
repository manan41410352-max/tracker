import { WorkflowContext } from "@/context/WorkflowContext";
import React, { useContext } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import AgentSettings from "../_nodeSettings/AgentSettings";
import EndSettings from "../_nodeSettings/EndSettings";
import IfElseSettings from "../_nodeSettings/IfElseSettings";
import WhileSettings from "../_nodeSettings/WhileSettings";
import UserApproval from "../_nodeSettings/UserApproval";
import ApiSettings from "../_nodeSettings/ApiSettings";
import QuestionSettings from "../_nodeSettings/QuestionSettings";
import FormSettings from "../_nodeSettings/FormSettings";
import CaptchaSettings from "../_nodeSettings/CaptchaSettings";

type Props = {
  showPlaceholder?: boolean;
  className?: string;
};

function SettingPanel({ showPlaceholder = false, className }: Props) {
  const { selectedNode, setAddedNodes, setNodeEdges, setSelectedNode } =
    useContext(WorkflowContext);

  const onUpdateNodeData = (formData: any) => {
    if (!selectedNode) {
      return;
    }

    const updateNode = {
      ...selectedNode,
      data: {
        ...selectedNode.data,
        label: formData.name || selectedNode.data?.label || selectedNode.type,
        settings: formData,
      },
    };

    setAddedNodes((prevNode: any) =>
      prevNode.map((node: any) => (node.id === selectedNode.id ? updateNode : node))
    );
  };

  const onDeleteSelectedNode = () => {
    if (!selectedNode || selectedNode.id === "start" || selectedNode.deletable === false) {
      return;
    }

    setAddedNodes((prevNode: any) =>
      prevNode.filter((node: any) => node.id !== selectedNode.id)
    );
    setNodeEdges((prevEdges: any) =>
      prevEdges.filter(
        (edge: any) => edge.source !== selectedNode.id && edge.target !== selectedNode.id
      )
    );
    setSelectedNode(null);
    toast.success("Node deleted from the workflow.");
  };

  if (!selectedNode) {
    return showPlaceholder ? (
      <div className={cn("rounded-2xl border border-border bg-card p-5 shadow-sm dark:border-slate-800/80 dark:bg-slate-950/70 dark:shadow-black/20", className)}>
        <h2 className="text-base font-semibold text-foreground">Node inspector</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Select a block on the canvas to edit its fields, agent instruction, form
          schema, branching logic, or API configuration here.
        </p>
      </div>
    ) : null;
  }

  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5 shadow-sm dark:border-slate-800/80 dark:bg-slate-950/70 dark:shadow-black/20", className)}>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Node inspector</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Editing: {selectedNode?.data?.label || selectedNode?.type}
        </p>
      </div>

      {selectedNode?.type == "AgentNode" && (
        <AgentSettings
          selectedNode={selectedNode}
          updateFormData={(value: any) => onUpdateNodeData(value)}
        />
      )}
      {selectedNode?.type == "EndNode" && (
        <EndSettings
          selectedNode={selectedNode}
          updateFormData={(value: any) => onUpdateNodeData(value)}
        />
      )}
      {selectedNode?.type == "IfElseNode" && (
        <IfElseSettings
          selectedNode={selectedNode}
          updateFormData={(value: any) => onUpdateNodeData(value)}
        />
      )}
      {selectedNode?.type == "WhileNode" && (
        <WhileSettings
          selectedNode={selectedNode}
          updateFormData={(value: any) => onUpdateNodeData(value)}
        />
      )}
      {selectedNode?.type == "UserApprovalNode" && (
        <UserApproval
          selectedNode={selectedNode}
          updateFormData={(value: any) => onUpdateNodeData(value)}
        />
      )}
      {selectedNode?.type == "ApiNode" && (
        <ApiSettings
          selectedNode={selectedNode}
          updateFormData={(value: any) => onUpdateNodeData(value)}
        />
      )}
      {selectedNode?.type == "QuestionNode" && (
        <QuestionSettings
          selectedNode={selectedNode}
          updateFormData={(value: any) => onUpdateNodeData(value)}
        />
      )}
      {selectedNode?.type == "FormNode" && (
        <FormSettings
          selectedNode={selectedNode}
          updateFormData={(value: any) => onUpdateNodeData(value)}
        />
      )}
      {selectedNode?.type == "CaptchaNode" && (
        <CaptchaSettings
          selectedNode={selectedNode}
          updateFormData={(value: any) => onUpdateNodeData(value)}
        />
      )}

      {selectedNode?.id !== "start" && selectedNode?.deletable !== false ? (
        <Button variant="destructive" className="mt-4 w-full" onClick={onDeleteSelectedNode}>
          <Trash2 />
          Delete node
        </Button>
      ) : null}
    </div>
  );
}

export default SettingPanel;
