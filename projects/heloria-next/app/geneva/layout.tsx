import type { Metadata } from "next";
import type { ReactNode } from "react";

/* The workbench the machine was built on. Never indexed, live or not: the
   page is a client component, so its metadata has to live here. */
export const metadata: Metadata = {
  title: "Geneva workbench — Heloria Labs",
  robots: { index: false, follow: false },
};

export default function GenevaLayout({ children }: { children: ReactNode }) {
  return children;
}
