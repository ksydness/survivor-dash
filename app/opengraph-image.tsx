import { ogCard, OG_SIZE, OG_BRAND } from '@/lib/og';

export const alt = 'Fantasy Survivor — friends-league dashboard & draft hub';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return ogCard({ heading: OG_BRAND.name, sub: OG_BRAND.tagline });
}
