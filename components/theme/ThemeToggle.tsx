"use client";

import { useEffect, useState } from "react";
import { MoonStar, SunMedium } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const isDark = mounted && resolvedTheme === "dark";

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={() => mounted && setTheme(isDark ? "light" : "dark")}
      title={
        mounted
          ? isDark
            ? "Switch to light mode"
            : "Switch to dark mode"
          : "Toggle color theme"
      }
      aria-label={
        mounted
          ? isDark
            ? "Switch to light mode"
            : "Switch to dark mode"
          : "Toggle color theme"
      }
      className="app-chip rounded-full border-white/50 bg-white/70 shadow-sm hover:border-sky-300 hover:bg-white dark:border-sky-400/15 dark:bg-slate-950/60 dark:hover:bg-slate-900"
    >
      {mounted ? (
        isDark ? <SunMedium className="size-4" /> : <MoonStar className="size-4" />
      ) : (
        <span aria-hidden="true" className="size-4" />
      )}
    </Button>
  );
}

export default ThemeToggle;
