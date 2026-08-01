/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  // Emits a self-contained server bundle with only the node_modules it actually
  // uses, so the runtime image does not need the full dependency tree.
  output: "standalone",
  // The reverse proxy already reports the server; suppressing this removes a
  // fingerprinting hint.
  poweredByHeader: false,
};

export default nextConfig;
