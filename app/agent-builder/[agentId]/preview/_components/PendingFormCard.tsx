"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { PendingFormPayload } from "@/lib/runtime-types";

type Props = {
  form: PendingFormPayload;
  loading: boolean;
  onSubmit: (values: Record<string, string | string[]>) => void;
};

function PendingFormCard({ form, loading, onSubmit }: Props) {
  const [values, setValues] = useState<Record<string, string | string[]>>({});

  useEffect(() => {
    setValues(form.values || {});
  }, [form]);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{form.nodeName}</h3>
        {form.description ? (
          <p className="text-sm text-muted-foreground">{form.description}</p>
        ) : null}
      </div>

      <div className="mt-4 space-y-4">
        {form.fields.map((field) => (
          <div key={field.id} className="space-y-2">
            <Label>{field.label}</Label>

            {field.type === "long-text" ? (
              <Textarea
                value={String(values[field.id] || "")}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, [field.id]: event.target.value }))
                }
                placeholder={field.placeholder}
              />
            ) : null}

            {field.type === "single-select" ? (
              <RadioGroup
                value={String(values[field.id] || "")}
                onValueChange={(value) =>
                  setValues((prev) => ({ ...prev, [field.id]: value }))
                }
                className="gap-3"
              >
                {field.options.map((option) => (
                  <label
                    key={option}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-muted/30 px-3 py-3 text-sm text-foreground"
                  >
                    <RadioGroupItem value={option} />
                    <span>{option}</span>
                  </label>
                ))}
              </RadioGroup>
            ) : null}

            {field.type === "multi-select" ? (
              <div className="space-y-2">
                {field.options.map((option) => {
                  const current = Array.isArray(values[field.id]) ? values[field.id] : [];

                  return (
                    <label
                      key={option}
                      className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-3 py-3 text-sm text-foreground"
                    >
                      <Checkbox
                        checked={current.includes(option)}
                        onCheckedChange={(checked) =>
                          setValues((prev) => {
                            const existing = Array.isArray(prev[field.id])
                              ? (prev[field.id] as string[])
                              : [];

                            return {
                              ...prev,
                              [field.id]: checked
                                ? [...existing, option]
                                : existing.filter((item) => item !== option),
                            };
                          })
                        }
                      />
                      <span>{option}</span>
                    </label>
                  );
                })}
              </div>
            ) : null}

            {["short-text", "number", "url"].includes(field.type) ? (
              <Input
                type={field.type === "number" ? "number" : field.type === "url" ? "url" : "text"}
                value={String(values[field.id] || "")}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, [field.id]: event.target.value }))
                }
                placeholder={field.placeholder}
              />
            ) : null}
          </div>
        ))}
      </div>

      <Button
        className="mt-4 w-full"
        disabled={loading}
        onClick={() => onSubmit(values)}
      >
        {form.submitLabel || "Continue"}
      </Button>
    </div>
  );
}

export default PendingFormCard;
