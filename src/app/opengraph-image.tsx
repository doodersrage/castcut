import { ImageResponse } from 'next/og';

export const alt = 'Castcut';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Open Graph / social share image — brand mark language (teal → sky → sand). */
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 64,
        background: 'linear-gradient(145deg, #0b0f14 0%, #121820 48%, #0c0c10 100%)',
        color: '#ececef',
        fontFamily: "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif",
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 18,
            border: '2px solid rgba(94,234,212,0.45)',
            background: '#141b24',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            paddingLeft: 14,
            paddingRight: 14,
            gap: 7,
          }}
        >
          <div style={{ height: 6, width: 36, background: '#5eead4', borderRadius: 3 }} />
          <div style={{ height: 6, width: 28, background: '#38bdf8', borderRadius: 3 }} />
          <div style={{ height: 6, width: 32, background: '#f0ab7c', borderRadius: 3 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 48, fontWeight: 600, letterSpacing: '-0.03em' }}>Castcut</div>
          <div style={{ fontSize: 22, color: '#9eb6e0', fontFamily: 'system-ui, sans-serif' }}>
            Cast → Moodboard → Day → Cut
          </div>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 18,
          color: '#a1a4ad',
        }}
      >
        <div style={{ width: 28, height: 4, borderRadius: 2, background: '#5eead4' }} />
        <div style={{ width: 20, height: 4, borderRadius: 2, background: '#38bdf8' }} />
        <div style={{ width: 24, height: 4, borderRadius: 2, background: '#f0ab7c' }} />
        <span style={{ marginLeft: 8 }}>local character films</span>
      </div>
    </div>,
    size
  );
}
