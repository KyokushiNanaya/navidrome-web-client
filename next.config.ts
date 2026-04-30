import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    localPatterns: [
      {
        pathname: "/api/navidrome-cover",
      },
    ],
  },
  reactStrictMode: true,
};

export default nextConfig;
