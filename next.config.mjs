/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  assetPrefix: ".",
  images: {
    unoptimized: true,
  },
  transpilePackages: ["@json-to-sql/core"],
};

export default nextConfig;
