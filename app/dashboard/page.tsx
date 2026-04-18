"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  ClipboardList,
  Dumbbell,
  HeartHandshake,
  Moon,
  Network,
  Target,
  Zap,
  Briefcase,
  CircleDollarSign,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import CreateAgentSection from "./_components/CreateAgentSection";
import MyAgents from "./_components/MyAgents";

const lifeAreas = [
  { label: "Sleep", icon: Moon, tone: "text-indigo-700 dark:text-indigo-200" },
  { label: "Energy", icon: Zap, tone: "text-amber-700 dark:text-amber-200" },
  { label: "Focus", icon: Target, tone: "text-sky-700 dark:text-sky-200" },
  { label: "Work", icon: Briefcase, tone: "text-blue-700 dark:text-blue-200" },
  { label: "Money", icon: CircleDollarSign, tone: "text-emerald-700 dark:text-emerald-200" },
  { label: "Friends & family", icon: HeartHandshake, tone: "text-rose-700 dark:text-rose-200" },
  { label: "Health", icon: Dumbbell, tone: "text-teal-700 dark:text-teal-200" },
  { label: "Little jobs", icon: ClipboardList, tone: "text-orange-700 dark:text-orange-200" },
];

function Dashboard() {
  return (
    <div className="space-y-6">
      <Card className="app-hero-card rounded-[2rem]">
        <CardContent className="grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr] lg:p-8">
          <div className="space-y-4">
            <Badge className="app-chip w-fit rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-sky-700 hover:bg-transparent dark:text-sky-200">
              Systematic Tracker
            </Badge>
            <div className="space-y-3">
              <CardTitle className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 lg:text-[2.8rem]">
                See the hidden architecture of your week before it runs you.
              </CardTitle>
              <CardDescription className="max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
                Map sleep, energy, focus, work, money, relationships, health,
                and small jobs as one connected system. Find the constraint,
                choose the leverage point, then turn it into a reusable plan.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="shadow-lg shadow-sky-500/20">
                <Link href="/dashboard#new-agent">
                  Start a system map
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/dashboard/my-agents">Browse saved systems</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {lifeAreas.map((item) => (
              <div key={item.label} className="app-metric-card rounded-2xl p-4">
                <div
                  className={`flex size-10 items-center justify-center rounded-xl bg-white/65 dark:bg-slate-950/70 ${item.tone}`}
                >
                  <item.icon className="size-4" />
                </div>
                <p className="mt-4 font-medium text-foreground">{item.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
            {[
              {
                icon: Network,
                title: "Dependency map",
                copy: "Connect daily domains so one missed habit or decision shows its downstream effects.",
                tint: "text-sky-700 dark:text-sky-200",
              },
              {
                icon: Target,
                title: "Leverage diagnosis",
                copy: "Spot the highest-impact intervention instead of treating every task as equal.",
                tint: "text-emerald-700 dark:text-emerald-200",
              },
              {
                icon: CalendarCheck,
                title: "Operating layer",
                copy: "Convert repeated choices into routines, rules, alerts, and weekly priorities.",
                tint: "text-amber-700 dark:text-amber-200",
              },
            ].map((item) => (
              <div key={item.title} className="app-metric-card rounded-2xl p-4">
                <div
                  className={`flex size-10 items-center justify-center rounded-xl bg-white/65 dark:bg-slate-950/70 ${item.tint}`}
                >
                  <item.icon className="size-4" />
                </div>
                <p className="mt-4 font-medium text-foreground">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.copy}</p>
              </div>
            ))}
      </div>

      <div id="new-agent">
        <CreateAgentSection />
      </div>

      <Card className="app-panel rounded-[2rem]">
        <CardHeader>
          <CardTitle className="text-2xl">Saved System Maps</CardTitle>
          <CardDescription className="max-w-2xl leading-6">
            Reopen a saved life-system map and keep refining the constraints,
            routines, and decisions that shape the week.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MyAgents />
        </CardContent>
      </Card>
    </div>
  );
}

export default Dashboard;
