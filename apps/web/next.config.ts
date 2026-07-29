import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
      {
        source: '/go2rtc/:path*',
        destination: 'http://localhost:1984/:path*',
      },
    ];
  },
};

export default nextConfig;
