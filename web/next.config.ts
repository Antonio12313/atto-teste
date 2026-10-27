import type { NextConfig } from "next"

const apiUrl = process.env.API_INTERNAL_URL
if (!apiUrl)
  throw new Error(
    "Defina API_INTERNAL_URL antes de iniciar ou construir a web."
  )
const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }]
  },
}
export default nextConfig
