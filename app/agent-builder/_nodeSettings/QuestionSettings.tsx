import { useEffect, useState } from "react";
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

function QuestionSettings({ selectedNode, updateFormData }: any) {
  const [formData, setFormData] = useState({
    name: "",
    question: "",
    responseType: "short-answer",
    optionsText: "",
    required: true,
  });

  useEffect(() => {
    const settings = selectedNode?.data?.settings ?? {};
    setFormData({
      name: settings.name || "",
      question: settings.question || "",
      responseType: settings.responseType === "mcq" ? "mcq" : "short-answer",
      optionsText: Array.isArray(settings.options) ? settings.options.join("\n") : "",
      required: settings.required ?? true,
    });
  }, [selectedNode]);

  const handleChange = (key: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const onSave = () => {
    updateFormData({
      name: formData.name,
      question: formData.question,
      responseType: formData.responseType,
      options:
        formData.responseType === "mcq"
          ? formData.optionsText
              .split(/\r?\n/)
              .map((option) => option.trim())
              .filter(Boolean)
          : [],
      required: formData.required,
    });
    toast.success("Question settings updated.");
  };

  return (
    <div>
      <h2 className="font-bold">Ask User</h2>
      <p className="mt-2 text-gray-500">
        Gather missing requirements before the workflow continues.
      </p>

      <div className="mt-3 space-y-1">
        <Label>Name</Label>
        <Input
          placeholder="Requirement question"
          value={formData.name}
          onChange={(event) => handleChange("name", event.target.value)}
        />
      </div>

      <div className="mt-3 space-y-1">
        <Label>Question</Label>
        <Textarea
          placeholder="What should the agent ask the user?"
          value={formData.question}
          onChange={(event) => handleChange("question", event.target.value)}
        />
      </div>

      <div className="mt-3 space-y-1">
        <Label>Response Type</Label>
        <Select
          value={formData.responseType}
          onValueChange={(value) => handleChange("responseType", value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Response type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="short-answer">Short answer</SelectItem>
            <SelectItem value="mcq">MCQ</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {formData.responseType === "mcq" ? (
        <div className="mt-3 space-y-1">
          <Label>Options</Label>
          <Textarea
            placeholder={`Beginner\nIntermediate\nAdvanced`}
            value={formData.optionsText}
            onChange={(event) => handleChange("optionsText", event.target.value)}
          />
          <p className="text-xs text-gray-500">Add one option per line.</p>
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between">
        <Label>Required</Label>
        <Switch
          checked={formData.required}
          onCheckedChange={(checked) => handleChange("required", checked)}
        />
      </div>

      <Button className="mt-5 w-full" onClick={onSave}>
        Save
      </Button>
    </div>
  );
}

export default QuestionSettings;
