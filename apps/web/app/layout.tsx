import "@repo/ui/styles.css";
import "./globals.css";
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { WorkspaceProvider } from "../lib/workspace/WorkspaceContext";

export const metadata: Metadata = {
  title: "CineCraft Studio - Professional Video Editor",
  description: "Local-first AI-native short-form video editor and clip cutter",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${GeistSans.className} bg-neutral-950 text-neutral-100 antialiased`}>
        <WorkspaceProvider>
          {children}
        </WorkspaceProvider>
      </body>
    </html>
  );
}
