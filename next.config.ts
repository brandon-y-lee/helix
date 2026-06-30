import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
