"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const EMPTY_FIELD = {
  id: "",
  label: "",
  type: "short-text",
  required: true,
  optionsText: "",
  placeholder: "",
  memoryKey: "",
  reusable: false,
};

function FormSettings({ selectedNode, updateFormData }: any) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    submitLabel: "Continue",
    fields: [EMPTY_FIELD],
  });

  useEffect(() => {
    const settings = selectedNode?.data?.settings ?? {};
    setFormData({
      name: settings.name || "",
      description: settings.description || "",
      submitLabel: settings.submitLabel || "Continue",
      fields: Array.isArray(settings.fields) && settings.fields.length
        ? settings.fields.map((field: any, index: number) => ({
            id: field.id || `field-${index + 1}`,
            label: field.label || "",
            type: field.type || "short-text",
            required: field.required ?? true,
            optionsText: Array.isArray(field.options) ? field.options.join("\n") : "",
            placeholder: field.placeholder || "",
            memoryKey: field.memoryKey || "",
            reusable: field.reusable ?? false,
          }))
        : [EMPTY_FIELD],
    });
  }, [selectedNode]);

  const updateField = (index: number, key: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      fields: prev.fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, [key]: value } : field
      ),
    }));
  };

  const addField = () => {
    setFormData((prev) => ({
      ...prev,
      fields: [
        ...prev.fields,
        {
          ...EMPTY_FIELD,
          id: `field-${prev.fields.length + 1}`,
        },
      ],
    }));
  };

  const removeField = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      fields: prev.fields.filter((_, fieldIndex) => fieldIndex !== index),
    }));
  };

  const onSave = () => {
    updateFormData({
      name: formData.name,
      description: formData.description,
      submitLabel: formData.submitLabel,
      fields: formData.fields
        .filter((field) => field.label.trim())
        .map((field, index) => ({
          id: field.id?.trim() || `field-${index + 1}`,
          label: field.label.trim(),
          type: field.type,
          required: field.required,
          options:
            field.type === "single-select" || field.type === "multi-select"
              ? field.optionsText
                  .split(/\r?\n/)
                  .map((option) => option.trim())
                  .filter(Boolean)
              : [],
          placeholder: field.placeholder?.trim() || undefined,
          memoryKey: field.memoryKey?.trim() || undefined,
          reusable: Boolean(field.reusable),
        })),
    });
    toast.success("Form settings updated.");
  };

  return (
    <div>
      <h2 className="font-bold">Form</h2>
      <p className="mt-2 text-gray-500">
        Collect richer workflow inputs anywhere in the flow.
      </p>

      <div className="mt-3 space-y-1">
        <Label>Name</Label>
        <Input
          value={formData.name}
          onChange={(event) =>
            setFormData((prev) => ({ ...prev, name: event.target.value }))
          }
          placeholder="Collect details"
        />
      </div>

      <div className="mt-3 space-y-1">
        <Label>Description</Label>
        <Textarea
          value={formData.description}
          onChange={(event) =>
            setFormData((prev) => ({ ...prev, description: event.target.value }))
          }
          placeholder="Explain what the user needs to fill in before the workflow continues."
        />
      </div>

      <div className="mt-3 space-y-1">
        <Label>Submit Label</Label>
        <Input
          value={formData.submitLabel}
          onChange={(event) =>
            setFormData((prev) => ({ ...prev, submitLabel: event.target.value }))
          }
          placeholder="Continue"
        />
      </div>

      <div className="mt-4 space-y-4">
        {formData.fields.map((field, index) => {
          const needsOptions =
            field.type === "single-select" || field.type === "multi-select";

          return (
            <div
              key={`${field.id}-${index}`}
              className="rounded-2xl border border-border p-3"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Field {index + 1}</p>
                {formData.fields.length > 1 ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeField(index)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Field ID</Label>
                  <Input
                    value={field.id}
                    onChange={(event) => updateField(index, "id", event.target.value)}
                    placeholder={`field-${index + 1}`}
                  />
                </div>

                <div className="space-y-1">
                  <Label>Label</Label>
                  <Input
                    value={field.label}
                    onChange={(event) => updateField(index, "label", event.target.value)}
                    placeholder="Website URL"
                  />
                </div>

                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select
                    value={field.type}
                    onValueChange={(value) => updateField(index, "type", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Field type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short-text">Short text</SelectItem>
                      <SelectItem value="long-text">Long text</SelectItem>
                      <SelectItem value="single-select">Single select</SelectItem>
                      <SelectItem value="multi-select">Multi select</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="url">URL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {needsOptions ? (
                  <div className="space-y-1">
                    <Label>Options</Label>
                    <Textarea
                      value={field.optionsText}
                      onChange={(event) =>
                        updateField(index, "optionsText", event.target.value)
                      }
                      placeholder={`Option 1\nOption 2`}
                    />
                  </div>
                ) : null}

                <div className="space-y-1">
                  <Label>Placeholder</Label>
                  <Input
                    value={field.placeholder}
                    onChange={(event) =>
                      updateField(index, "placeholder", event.target.value)
                    }
                    placeholder="Enter a value"
                  />
                </div>

                <div className="space-y-1">
                  <Label>Reusable Memory Key</Label>
                  <Input
                    value={field.memoryKey}
                    onChange={(event) =>
                      updateField(index, "memoryKey", event.target.value)
                    }
                    placeholder="company.website"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Required</Label>
                  <Switch
                    checked={field.required}
                    onCheckedChange={(checked) =>
                      updateField(index, "required", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Save To Reusable Memory</Label>
                  <Switch
                    checked={field.reusable}
                    onCheckedChange={(checked) =>
                      updateField(index, "reusable", checked)
                    }
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Button variant="outline" className="mt-4 w-full" onClick={addField}>
        <Plus className="mr-1 size-4" />
        Add field
      </Button>

      <Button className="mt-4 w-full" onClick={onSave}>
        Save
      </Button>
    </div>
  );
}

export default FormSettings;
