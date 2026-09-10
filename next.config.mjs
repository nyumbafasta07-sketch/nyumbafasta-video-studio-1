/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // node:sqlite and the ffmpeg-static binary must not be bundled by webpack.
  experimental: {
    serverComponentsExternalPackages: ["ffmpeg-static"],
  },
  webpack: (config) => {
    config.externals = config.externals || [];
    config.externals.push({ "node:sqlite": "commonjs node:sqlite" });
    return config;
  },
};

export default nextConfig;
