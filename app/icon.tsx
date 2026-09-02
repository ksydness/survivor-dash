import { ImageResponse } from 'next/og';
import { OG_BRAND } from '@/lib/og';

// Favicon: the brand emoji on the app's dark background.
export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0c0a09', borderRadius: 14, fontSize: 42, lineHeight: 1 }}>
        {OG_BRAND.emoji}
      </div>
    ),
    { ...size },
  );
}
