import Link from "next/link";
import React from "react";
import { ArrowLeft, Layers3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import MyAgents from "../_components/MyAgents";

function MyAgentPage() {
  return (
    <div className="space-y-6">
      <Card className="app-hero-card rounded-[2rem]">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-3">
              <Badge className="app-chip w-fit rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-sky-700 hover:bg-transparent dark:text-sky-200">
                Library
              </Badge>
              <CardTitle className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                Saved System Maps
              </CardTitle>
              <CardDescription className="max-w-2xl leading-7">
                Re-open any saved tracker map, continue refining the dependencies,
                or preview a published run.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link href="/dashboard">
                  <ArrowLeft className="size-4" />
                  Back to dashboard
                </Link>
              </Button>
              <div className="app-chip flex items-center gap-2 rounded-full px-4 py-2 text-sm text-muted-foreground">
                <Layers3 className="size-4 text-sky-500" />
                Browse and reopen workflows
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>
      <MyAgents />
    </div>
  );
}

export default MyAgentPage;
