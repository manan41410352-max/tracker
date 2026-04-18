"use client";

import { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

import { ConvexClientProvider } from "@/app/ConvexClientProvider";
import Provider from "@/app/provider";

type AppProvidersProps = {
  children: ReactNode;
  convexEnabled: boolean;
  convexUrl?: string;
};

export default function AppProviders({
  children,
  convexEnabled,
  convexUrl,
}: AppProvidersProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <ConvexClientProvider convexUrl={convexUrl}>
        <Provider convexEnabled={convexEnabled}>
          {children}
          <Toaster />
        </Provider>
      </ConvexClientProvider>
    </ThemeProvider>
  );
}
