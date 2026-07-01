/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",              // static HTML/JS export → out/ (no server needed to build)
  images: { unoptimized: true }
};
export default nextConfig;
