import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleDashed } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ConfigGroup } from "@/lib/app-config";

type SetupRequiredProps = {
  title: string;
  description: string;
  missingGroups: ConfigGroup[];
};

export default function SetupRequired({
  title,
  description,
  missingGroups,
}: SetupRequiredProps) {
  return (
    <section className="app-shell relative min-h-[70vh] overflow-hidden px-6 py-16 sm:px-10">
      <div className="relative mx-auto flex max-w-5xl flex-col gap-8">
        <div className="max-w-2xl space-y-4">
          <Badge className="app-chip rounded-full px-3 py-1 text-sky-700 hover:bg-transparent dark:text-sky-200">
            Setup required
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {title}
          </h1>
          <p className="text-base text-muted-foreground sm:text-lg">{description}</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="shadow-lg shadow-sky-500/20">
              <Link href="/#quickstart">
                Review quickstart
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/">Back to home</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {missingGroups.map((group) => (
            <Card
              key={group.id}
              className="app-panel rounded-[1.75rem] text-foreground"
            >
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-lg">{group.title}</CardTitle>
                  {group.ready ? (
                    <CheckCircle2 className="size-5 text-emerald-400" />
                  ) : (
                    <CircleDashed className="size-5 text-amber-400" />
                  )}
                </div>
                <CardDescription className="text-muted-foreground">
                  {group.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Missing environment variables
                </p>
                <div className="flex flex-wrap gap-2">
                  {group.envs.map((envName) => (
                    <Badge
                      key={envName}
                      variant="outline"
                      className="app-chip rounded-full font-mono text-[11px] text-foreground"
                    >
                      {envName}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
