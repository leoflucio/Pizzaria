import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/client", "ioredis", "bcryptjs"],
};

export default config;
