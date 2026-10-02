import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/worker-based packages used by OCR must load from node_modules, not the bundle.
  serverExternalPackages: ["tesseract.js", "@napi-rs/canvas"],
};

export default nextConfig;
