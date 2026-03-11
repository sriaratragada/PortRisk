import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "../tests/fetchCache.js": path.join(__dirname, "lib/shims/yahoo-fetch-cache.js")
    };
    return config;
  }
};

export default nextConfig;
