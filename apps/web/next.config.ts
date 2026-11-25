import type { NextConfig } from "next";
import path from "path";

const isProd = process.env.NODE_ENV === "production";
const internalHost = process.env.TAURI_DEV_HOST || "127.0.0.1";

const nextConfig: NextConfig = {
  // Ensure Next.js uses SSG instead of SSR for Tauri desktop distribution
  output: "export",
  // Note: This feature is required to use the Next.js Image component in SSG mode
  images: {
    unoptimized: true,
  },
  // Configure assetPrefix so assets resolve correctly in Tauri webview
  assetPrefix: isProd
    ? undefined
    : process.env.TAURI_DEV_HOST
    ? `http://${internalHost}:3001`
    : undefined,
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    config.cache = false;
    return config;
  },
};

export default nextConfig;
