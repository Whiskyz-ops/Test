/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",              // static HTML/JS export → out/
  images: { unoptimized: true },
  assetPrefix: ".",             // relative asset paths so out/index.html works via file:// (double-click)
  trailingSlash: false
};
export default nextConfig;
