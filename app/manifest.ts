import type { MetadataRoute } from 'next';

// Web app manifest: lets "Add to Home Screen" launch the site full-screen with
// the proper name and icon instead of as a browser tab.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Fantasy Survivor',
    short_name: 'Survivor',
    description: 'Friends-league Fantasy Survivor dashboard & live draft hub',
    start_url: '/',
    display: 'standalone',
    background_color: '#0c0a09',
    theme_color: '#0c0a09',
    icons: [
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
      { src: '/icon-512', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
