import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';

import baseConfig from './next.config.base.cjs';

// Skip @next/bundle-analyzer wrapper entirely when ANALYZE is off — saves build-time.
// When enabled, wrap with the standard plugin (openAnalyzer: false = silent mode).
const _isAnalyzing = process.env.ANALYZE === 'true';
// PERF_SOURCEMAPS=1: browser source maps in a production build, to read a profile by function
// (M6 V7, scripts/perf-large-project.mts). Off by default: they would publish the source.
const config = (
  process.env.PERF_SOURCEMAPS === '1'
    ? { ...baseConfig, productionBrowserSourceMaps: true }
    : baseConfig
) as NextConfig;
export default (_isAnalyzing
  ? bundleAnalyzer({ ...config, openAnalyzer: true })
  : config) as NextConfig;
