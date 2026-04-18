import type { Metadata } from "next";
import "./globals.css";
import {Outfit} from 'next/font/google'
import AppProviders from "@/app/AppProviders";
import { getSetupStatus } from "@/lib/app-config";

export const metadata: Metadata = {
  title: "Systematic Tracker",
  description: "A local life operating system for mapping constraints, priorities, and leverage points.",
};

const outfit = Outfit({subsets:['latin']});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const setup = getSetupStatus();

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={outfit.className}
      >
        <AppProviders
          convexEnabled={setup.convexReady}
          convexUrl={process.env.NEXT_PUBLIC_CONVEX_URL}
        >
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
