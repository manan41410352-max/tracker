"use client";

import { Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { BuilderClarificationQuestion } from "@/lib/agent-builder";

type Props = {
  open: boolean;
  questions: BuilderClarificationQuestion[];
  values: Record<string, string>;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onValueChange: (questionId: string, value: string) => void;
  onSubmit: () => void;
};

function BuilderClarificationDialog({
  open,
  questions,
  values,
  loading,
  onOpenChange,
  onValueChange,
  onSubmit,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto rounded-3xl border border-border p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle>Refine the workflow brief</DialogTitle>
          <DialogDescription>
            Answer a few focused questions so the builder can research better, plan
            the agent precisely, and generate a workflow you can keep editing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          {questions.map((question, index) => (
            <div
              key={question.id}
              className="rounded-2xl border border-border bg-muted/30 p-4"
            >
              <div className="mb-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Question {index + 1}
                </p>
                <h3 className="mt-2 text-sm font-semibold text-foreground">
                  {question.label}
                </h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {question.question}
                </p>
              </div>

              {question.responseType === "mcq" ? (
                <RadioGroup
                  value={values[question.id] || ""}
                  onValueChange={(value) => onValueChange(question.id, value)}
                >
                  {question.options.map((option) => (
                    <label
                      key={option}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground transition-colors hover:bg-accent"
                    >
                      <RadioGroupItem value={option} />
                      <span>{option}</span>
                    </label>
                  ))}
                </RadioGroup>
              ) : question.question.length > 110 ? (
                <Textarea
                  value={values[question.id] || ""}
                  onChange={(event) =>
                    onValueChange(question.id, event.target.value)
                  }
                  placeholder={question.placeholder || "Type your answer"}
                  className="min-h-28"
                />
              ) : (
                <Input
                  value={values[question.id] || ""}
                  onChange={(event) =>
                    onValueChange(question.id, event.target.value)
                  }
                  placeholder={question.placeholder || "Type your answer"}
                />
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Later
          </Button>
          <Button onClick={onSubmit} disabled={loading}>
            {loading ? <Loader2Icon className="animate-spin" /> : null}
            {loading ? "Building workflow..." : "Research and build workflow"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BuilderClarificationDialog;
