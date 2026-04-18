"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2Icon, Sparkles } from "lucide-react";

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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { BuilderClarificationQuestion } from "@/lib/agent-builder";

type TopicPack = {
  title: string;
  description: string;
  questions: BuilderClarificationQuestion[];
};

type Props = {
  open: boolean;
  loading: boolean;
  domainName: string;
  pack?: TopicPack | null;
  initialValues?: Record<string, string>;
  onOpenChange: (value: boolean) => void;
  onSubmit: (answers: Record<string, string>) => void;
};

function TrackerTopicIntakeDialog({
  open,
  loading,
  domainName,
  pack,
  initialValues = {},
  onOpenChange,
  onSubmit,
}: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) {
      return;
    }

    setAnswers(
      Object.fromEntries(
        (pack?.questions || []).map((question) => [
          question.id,
          String(initialValues[question.id] || ""),
        ])
      )
    );
  }, [initialValues, open, pack?.questions]);

  const missingRequired = useMemo(
    () =>
      (pack?.questions || []).some(
        (question) =>
          question.required !== false && !String(answers[question.id] || "").trim()
      ),
    [answers, pack?.questions]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-4xl overflow-hidden rounded-[2rem] border border-border p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle>{pack?.title || `${domainName} intake`}</DialogTitle>
          <DialogDescription>
            {pack?.description ||
              `Answer a few ${domainName.toLowerCase()} questions so this block can shape the timetable around your real constraints.`}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[66vh] px-6 py-5">
          {loading ? (
            <div className="flex min-h-56 items-center justify-center gap-3 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Preparing topic-specific questions with the tracker builder...
            </div>
          ) : (
            <div className="space-y-4 pb-2">
              {(pack?.questions || []).map((question, index) => {
                const answerValue = String(answers[question.id] || "");
                const useTextarea =
                  question.responseType !== "mcq" &&
                  (question.placeholder?.length || 0) > 36;

                return (
                  <div
                    key={question.id}
                    className="rounded-[1.6rem] border border-border bg-muted/20 p-5"
                  >
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Topic question {index + 1}
                      </p>
                      <p className="text-base font-medium text-foreground">{question.label}</p>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {question.question}
                      </p>
                    </div>

                    <div className="mt-4">
                      {question.responseType === "mcq" ? (
                        <RadioGroup
                          value={answerValue}
                          onValueChange={(value) =>
                            setAnswers((prev) => ({ ...prev, [question.id]: value }))
                          }
                          className="grid gap-3 md:grid-cols-2"
                        >
                          {question.options.map((option) => (
                            <label
                              key={option}
                              className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-background px-4 py-4 text-sm text-foreground"
                            >
                              <RadioGroupItem value={option} />
                              <span>{option}</span>
                            </label>
                          ))}
                        </RadioGroup>
                      ) : useTextarea ? (
                        <div className="space-y-2">
                          <Label className="sr-only">{question.label}</Label>
                          <Textarea
                            value={answerValue}
                            onChange={(event) =>
                              setAnswers((prev) => ({
                                ...prev,
                                [question.id]: event.target.value,
                              }))
                            }
                            placeholder={question.placeholder || "Type your answer"}
                            className="min-h-28"
                          />
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label className="sr-only">{question.label}</Label>
                          <Input
                            value={answerValue}
                            onChange={(event) =>
                              setAnswers((prev) => ({
                                ...prev,
                                [question.id]: event.target.value,
                              }))
                            }
                            placeholder={question.placeholder || "Type your answer"}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="border-t border-border px-6 py-4">
          <div className="flex w-full items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              These answers become reusable tracker context and a matching intake form on
              the canvas.
            </p>
            <Button
              onClick={() => onSubmit(answers)}
              disabled={loading || !pack?.questions?.length || missingRequired}
            >
              {loading ? <Loader2Icon className="animate-spin" /> : <Sparkles />}
              Add {domainName}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TrackerTopicIntakeDialog;
