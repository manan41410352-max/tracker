import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

function CaptchaSettings({ selectedNode, updateFormData }: any) {
  const [formData, setFormData] = useState({
    name: "",
    message: "",
    pauseWithoutBrowser: false,
    pauseOnAnyVerification: true,
  });

  useEffect(() => {
    const settings = selectedNode?.data?.settings ?? {};
    setFormData({
      name: settings.name || "",
      message: settings.message || "",
      pauseWithoutBrowser: Boolean(settings.pauseWithoutBrowser),
      pauseOnAnyVerification: settings.pauseOnAnyVerification ?? true,
    });
  }, [selectedNode]);

  const handleChange = (key: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const onSave = () => {
    updateFormData(formData);
    toast.success("CAPTCHA gate updated.");
  };

  return (
    <div>
      <h2 className="font-bold">CAPTCHA Gate</h2>
      <p className="mt-2 text-gray-500">
        Pause for manual browser verification when a CAPTCHA or human check appears.
      </p>

      <div className="mt-3 space-y-1">
        <Label>Name</Label>
        <Input
          placeholder="CAPTCHA Gate"
          value={formData.name}
          onChange={(event) => handleChange("name", event.target.value)}
        />
      </div>

      <div className="mt-3 space-y-1">
        <Label>Pause message</Label>
        <Textarea
          placeholder="Tell the user what to finish in the browser workspace before resuming."
          value={formData.message}
          onChange={(event) => handleChange("message", event.target.value)}
        />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="space-y-1">
          <Label>Pause on any verification</Label>
          <p className="text-xs text-gray-500">
            Include login or human-check screens, not only explicit CAPTCHA pages.
          </p>
        </div>
        <Switch
          checked={formData.pauseOnAnyVerification}
          onCheckedChange={(checked) => handleChange("pauseOnAnyVerification", checked)}
        />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="space-y-1">
          <Label>Pause if no browser is attached</Label>
          <p className="text-xs text-gray-500">
            Turn this on if the workflow must verify the live browser before continuing.
          </p>
        </div>
        <Switch
          checked={formData.pauseWithoutBrowser}
          onCheckedChange={(checked) => handleChange("pauseWithoutBrowser", checked)}
        />
      </div>

      <Button className="mt-5 w-full" onClick={onSave}>
        Save
      </Button>
    </div>
  );
}

export default CaptchaSettings;
