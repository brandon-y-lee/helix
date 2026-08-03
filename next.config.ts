import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      "/media/home/mei-pelle-hero.webm",
      "/media/home/mei-pelle-hero.mp4",
      "/media/home/plug-and-play-loop.mp4",
      "/media/home/final-cta-loop.mp4",
    ].map((source) => ({
      source,
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
      ],
    }));
  },
  async redirects() {
    return [
      {
        source: "/method",
        destination: "/system",
        permanent: true,
      },
      {
        source: "/products/reset-01-calming-gel-cleanser",
        destination: "/products/cleanse-01-calming-gel-cleanser",
        permanent: true,
      },
      {
        source: "/products/recode-03-pdrn-5-ampoule",
        destination: "/products/treat-03-pdrn-5-ampoule",
        permanent: true,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/mei-pelle-catalog/**",
      },
    ],
  },
};

export default nextConfig;
