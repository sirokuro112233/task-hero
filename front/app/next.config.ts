import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ["os3-358-12365.vs.sakura.ne.jp"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_URL ?? "http://back:8000"}/:path*`,
      },
      {
        source: "/ws/:path*",
        destination: `${process.env.BACKEND_URL ?? "http://back:8000"}/ws/:path*`,
      },
    ];
  },
};

export default nextConfig;
