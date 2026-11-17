/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 's2.googleusercontent.com',
        pathname: '/s2/favicons/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/uploads/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Content-Disposition', value: 'inline' },
          {
            key: 'Content-Security-Policy',
            value: "sandbox; default-src 'none'; img-src 'self' data:;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;