import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // next-intl's plugin uses experimental.turbo (Next.js <15 key) which is
  // rejected by Next.js 16. We manually wire the alias under the top-level
  // `turbopack` key that Next.js 16 requires.
  turbopack: {
    resolveAlias: {
      "next-intl/config": "./src/i18n/request.ts",
    },
  },
};

export default withNextIntl(nextConfig);
