import { ImageResponse } from 'next/og';
import { OG_BRAND } from '@/lib/og';

// 512px app icon for the web manifest (Android / desktop install prompts).
export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0c0a09', fontSize: 340, lineHeight: 1 }}>
        {OG_BRAND.emoji}
      </div>
    ),
    { width: 512, height: 512 },
  );
}
