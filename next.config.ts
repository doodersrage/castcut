import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';

import baseConfig from './next.config.base.cjs';

// Skip @next/bundle-analyzer wrapper entirely when ANALYZE is off — saves build-time.
// When enabled, wrap with the standard plugin (openAnalyzer: false = silent mode).
const _isAnalyzing = process.env.ANALYZE === 'true';
export default (_isAnalyzing
  ? bundleAnalyzer({ ...baseConfig, openAnalyzer: true })
  : baseConfig) as NextConfig;
