import "@repo/ui/styles.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { WorkspaceProvider } from "../lib/workspace/WorkspaceContext";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://winecut.vercel.app";

export const viewport: Viewport = {
  themeColor: "#0b0c10",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Winecut — Multi-Track Video Editor & 9:16 Clip Cutter",
    template: "%s | Winecut",
  },
  description:
    "Desktop and browser video editor for multi-track timeline editing, 9:16 dual-speaker split framing, color grading, and 60fps MP4 export on Windows, macOS, and Linux.",
  keywords: [
    "video editor",
    "clip cutter",
    "9:16 vertical split editor",
    "desktop video editor windows mac linux",
    "multi-track timeline editor",
    "ffmpeg video editor",
    "winecut",
  ],
  authors: [{ name: "Winecut" }],
  creator: "Winecut",
  category: "Video Editing Software",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Winecut",
    title: "Winecut — Multi-Track Video Editor & 9:16 Clip Cutter",
    description:
      "Cut clips on a millisecond timeline, frame two speakers into 9:16 vertical splits, apply color grades, and export MP4 files locally.",
    images: [
      {
        url: "https://images.unsplash.com/photo-1600353068440-6361ef3a86e8?auto=format&fit=crop&w=1200&q=85",
        width: 1200,
        height: 675,
        alt: "Winecut multi-track timeline and video editing workspace",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Winecut — Multi-Track Video Editor & 9:16 Clip Cutter",
    description:
      "Multi-track timeline editing, dual-speaker 9:16 framing, color grading, and local 60fps MP4 export for Windows, macOS, and Linux.",
    images: [
      "https://images.unsplash.com/photo-1600353068440-6361ef3a86e8?auto=format&fit=crop&w=1200&q=85",
    ],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${GeistSans.className} bg-[#0b0c10] text-zinc-100 antialiased`}>
        <WorkspaceProvider>
          {children}
        </WorkspaceProvider>
      </body>
    </html>
  );
}
