"use client";

import Link from "next/link";
import React, { useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Bot, Loader2Icon, Plus, Sparkles, Workflow } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { UserDetailContext } from "@/context/UserDetailContext";

const checklist = [
  {
    title: "Map the dependency",
    description: "Start with the real constraint, then connect the life areas it affects.",
    icon: Workflow,
  },
  {
    title: "Choose the leverage point",
    description: "Separate symptoms from the decision, routine, or rule that changes the week.",
    icon: Bot,
  },
  {
    title: "Turn it into a routine",
    description: "Use the local model to convert scattered tasks into a repeatable operating layer.",
    icon: Sparkles,
  },
];

function CreateAgentSection() {
  const [openDialog, setOpenDialog] = useState(false);
  const [agentName, setAgentName] = useState<string>("");
  const [loader, setLoader] = useState(false);

  const router = useRouter();
  const { userDetail } = useContext(UserDetailContext);
  const createAgentMutation = useMutation(api.agent.CreateAgent);
  const agentList = useQuery(api.agent.GetWorkspaceAgents, {});
  const totalAgents = agentList?.length ?? 0;
  const publishedAgents = agentList?.filter((agent: any) => agent.published).length ?? 0;
  const draftAgents = Math.max(totalAgents - publishedAgents, 0);

  const createAgent = async () => {
    if (!userDetail?._id) {
      toast.error("Your local workspace is still loading. Try again in a second.");
      return;
    }

    try {
      setLoader(true);

      const agentId = uuidv4();

      await createAgentMutation({
        agentId,
        name: agentName.trim(),
        userId: userDetail._id,
      });

      setOpenDialog(false);
      router.push(`/agent-builder/${agentId}`);
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong while creating the system map.");
    } finally {
      setLoader(false);
    }
  };

  return (
    <Dialog open={openDialog} onOpenChange={setOpenDialog}>
      <Card className="app-hero-card rounded-[2rem]">
        <CardContent className="grid gap-8 p-6 lg:grid-cols-[1.1fr_0.9fr] lg:p-8">
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="app-chip inline-flex rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-sky-700 dark:text-sky-200">
                Create system map
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 lg:text-[2.5rem]">
                Build a personal system you can actually use.
              </h2>
              <p className="max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
                Start with the Cascade brief: what is blocking progress, where the
                biggest leverage point sits, and which life domains need a reusable
                rule instead of another reminder.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <DialogTrigger asChild>
                <Button size="lg" className="shadow-lg shadow-sky-500/25">
                  <Plus className="size-4" />
                  Create system map
                </Button>
              </DialogTrigger>
              <Button asChild size="lg" variant="outline">
                <Link href="/dashboard/my-agents">View saved systems</Link>
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  label: "Systems",
                  value: totalAgents,
                  tone: "text-sky-700 dark:text-sky-200",
                },
                {
                  label: "Published",
                  value: publishedAgents,
                  tone: "text-emerald-700 dark:text-emerald-200",
                },
                {
                  label: "Drafts",
                  value: draftAgents,
                  tone: "text-amber-700 dark:text-amber-200",
                },
              ].map((item) => (
                <div key={item.label} className="app-metric-card rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {item.label}
                  </p>
                  <p className={`mt-2 text-3xl font-semibold ${item.tone}`}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="app-panel rounded-[1.75rem] p-5 text-slate-900 dark:text-slate-100">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="text-xl">Before you save the map</CardTitle>
              <CardDescription className="text-slate-600 dark:text-slate-400">
                A little structure up front makes the next decision easier to trust.
              </CardDescription>
            </CardHeader>
            <div className="space-y-3">
              {checklist.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-white/40 bg-white/55 p-4 dark:border-slate-800 dark:bg-slate-950/70"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-sky-500/12 dark:bg-sky-500/12">
                      <item.icon className="size-4 text-sky-700 dark:text-sky-200" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {item.title}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Name your system map</DialogTitle>
          <DialogDescription>
            Pick a clear name so it is easy to recognize later in Systematic Tracker.
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="April reset plan"
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
        />

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>

          <Button
            onClick={createAgent}
            disabled={loader || !agentName.trim() || !userDetail?._id}
          >
            {loader && <Loader2Icon className="mr-2 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreateAgentSection;
