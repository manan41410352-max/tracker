"use client";

import { Button } from "@/components/ui/button";
import type { PendingApprovalPayload } from "@/lib/runtime-types";

type Props = {
  approval: PendingApprovalPayload;
  loading: boolean;
  onDecision: (decision: "approve" | "reject") => void;
};

function PendingApprovalCard({ approval, loading, onDecision }: Props) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{approval.nodeName}</h3>
        <p className="text-sm text-muted-foreground">{approval.message}</p>
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          className="flex-1"
          disabled={loading}
          onClick={() => onDecision("approve")}
        >
          {approval.approveLabel || "Approve"}
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          disabled={loading}
          onClick={() => onDecision("reject")}
        >
          {approval.rejectLabel || "Reject"}
        </Button>
      </div>
    </div>
  );
}

export default PendingApprovalCard;
