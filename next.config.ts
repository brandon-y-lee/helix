import type { NextConfig } from "next";

const DAYS_PER_YEAR = 365;
const ONE_YEAR_SECONDS = 60 * 60 * 24 * DAYS_PER_YEAR;
const IMMUTABLE_MEDIA_CACHE_CONTROL =
  `public, max-age=${ONE_YEAR_SECONDS}, immutable`;
const HOME_VIDEO_PATHS = [
  "/media/home/mei-pelle-hero.webm",
  "/media/home/mei-pelle-hero.mp4",
  "/media/home/plug-and-play-loop.webm",
  "/media/home/plug-and-play-loop.mp4",
  "/media/home/final-cta-loop.webm",
  "/media/home/final-cta-loop.mp4",
] as const;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return HOME_VIDEO_PATHS.map((source) => ({
      source,
      headers: [
        {
          key: "Cache-Control",
          value: IMMUTABLE_MEDIA_CACHE_CONTROL,
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
        source: "/collections",
        destination: "/collections/shop",
        permanent: true,
      },
      {
        source: "/products",
        destination: "/collections/shop",
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
