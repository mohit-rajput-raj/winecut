import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://winecut.vercel.app';
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/studio'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
