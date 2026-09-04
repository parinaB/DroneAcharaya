import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // This project already has its own CLAUDE.md convention at every level
  // (root, backend/, ml/, simulation/) -- Next.js 16's auto-generated
  // frontend/AGENTS.md + frontend/CLAUDE.md stub would sit alongside and
  // conflict with that, so disabled here rather than left to regenerate on
  // every `next dev`.
  agentRules: false,
};

export default nextConfig;
