import BrandMark from '@/components/BrandMark';

/** Route-level loading — matches design tokens (not a generic blue spinner). */
export default function Loading() {
  return (
    <div
      className="ui-view-state min-h-[70vh]"
      role="status"
      aria-live="polite"
      aria-label="Loading Castcut"
    >
      <div className="ui-loader-mark">
        <BrandMark size={40} />
        <span className="ui-loader-ring" aria-hidden />
      </div>
      <p className="type-caption">Loading workspace…</p>
    </div>
  );
}
