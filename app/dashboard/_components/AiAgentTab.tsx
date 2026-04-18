import React from "react";
import { BookTemplate, Cable, MessagesSquare } from "lucide-react";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import MyAgents from "./MyAgents";

const templates = [
  {
    title: "Weekly reset",
    description: "Find the biggest constraint and turn it into a practical plan for the week.",
    icon: MessagesSquare,
  },
  {
    title: "Energy audit",
    description: "Connect sleep, work, health, and obligations to spot recurring leaks.",
    icon: Cable,
  },
  {
    title: "Decision planner",
    description: "Compare what to do now, delay, delegate, automate, or remove.",
    icon: BookTemplate,
  },
];

function AiAgentTab() {
  return (
    <Card className="border-slate-200/70 bg-white/85 shadow-sm backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/70 dark:shadow-black/20">
      <CardHeader>
        <CardTitle>System Maps</CardTitle>
        <CardDescription>
          Jump between your saved tracker maps and a few starter directions for the next one.
        </CardDescription>
      </CardHeader>
      <div className="px-6 pb-6">
        <Tabs defaultValue="myagent" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="myagent">Saved Systems</TabsTrigger>
            <TabsTrigger value="template">Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="myagent" className="mt-6">
            <MyAgents />
          </TabsContent>

          <TabsContent value="template" className="mt-6">
            <div className="grid gap-4 lg:grid-cols-3">
              {templates.map((template) => (
                <Card
                  key={template.title}
                  className="border-slate-200/70 bg-slate-50/80 shadow-none dark:border-slate-800/80 dark:bg-slate-950/40"
                >
                  <CardHeader>
                    <div className="mb-2 flex size-11 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-slate-900/80 dark:shadow-black/20">
                      <template.icon className="size-5 text-cyan-700 dark:text-cyan-300" />
                    </div>
                    <CardTitle className="text-lg">{template.title}</CardTitle>
                    <CardDescription>{template.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Card>
  );
}

export default AiAgentTab;
