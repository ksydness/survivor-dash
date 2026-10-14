import type { MetadataRoute } from 'next';

// Friends-league site: keep it out of search engines. Everyone who needs it
// gets the direct link. (Pairs with robots: noindex in the root metadata.)
// The viewing-nights calendar feed stays fetchable: Google Calendar's importer honors robots.txt.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/calendar.ics', disallow: '/' } };
}
