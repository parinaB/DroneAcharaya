import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16 auto-writes AGENTS.md/CLAUDE.md stubs on `next dev` — disabled
  // so they don't keep reappearing in place of the project's own docs.
  agentRules: false,
};

export default nextConfig;
