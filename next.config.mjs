/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://*.clerk.com",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "font-src 'self' https://cdn.jsdelivr.net data:",
      "img-src 'self' data: https://img.clerk.com https://*.clerk.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.clerk.accounts.dev https://*.clerk.com https://api.mfapi.in https://query1.finance.yahoo.com https://query2.finance.yahoo.com https://api.metals.dev https://api.gold-api.com https://api.frankfurter.app",
      "frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy',            value: csp },
          { key: 'X-Frame-Options',                    value: 'DENY' },
          { key: 'X-Content-Type-Options',             value: 'nosniff' },
          { key: 'Referrer-Policy',                    value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',                 value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security',          value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ]
  },
}

export default nextConfig
