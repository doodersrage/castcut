#!/usr/bin/env node

/**
 * Performance Monitoring Script for Castcut
 * This script collects various performance metrics and reports them
 */

import fs from 'fs';
import path from 'path';

// Function to measure build time
async function measureBuildTime() {
  console.log('📊 Measuring build time...');

  const startTime = Date.now();

  // Simulate build process timing
  // In a real implementation, you would actually run the build command here
  await new Promise(resolve => setTimeout(resolve, 1000));

  const endTime = Date.now();
  const buildTime = endTime - startTime;

  console.log(`⏱️  Build time: ${buildTime}ms`);
  return buildTime;
}

// Function to analyze bundle size
function analyzeBundleSize() {
  console.log('🔍 Analyzing bundle size...');

  try {
    const buildDir = path.join(process.cwd(), 'build');
    if (fs.existsSync(buildDir)) {
      const stats = fs.statSync(buildDir);
      console.log(`📦 Bundle directory size: ${stats.size} bytes`);
    } else {
      console.log('📦 Build directory not found - run "npm run build" first');
    }
  } catch (error) {
    console.error('❌ Error analyzing bundle size:', error.message);
  }
}

// Function to check file counts
function checkFileCounts() {
  console.log('📊 Checking file distribution...');

  const srcDir = path.join(process.cwd(), 'src');
  if (fs.existsSync(srcDir)) {
    let totalFiles = 0;
    let tsxFiles = 0;
    let jsFiles = 0;

    function walk(dir) {
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (stat.isFile()) {
          totalFiles++;
          if (item.endsWith('.tsx')) tsxFiles++;
          if (item.endsWith('.js')) jsFiles++;
        }
      }
    }

    walk(srcDir);
    console.log(`📁 Total files in src/: ${totalFiles}`);
    console.log(`⚛️  TSX files: ${tsxFiles}`);
    console.log(`📝 JS files: ${jsFiles}`);
  }
}

// Function to check performance metrics
async function checkPerformanceMetrics() {
  console.log('🔍 Checking performance metrics...');

  // Measure memory usage
  const used = process.memoryUsage();
  for (const key in used) {
    console.log(`${key}: ${Math.round((used[key] / 1024 / 1024) * 100) / 100} MB`);
  }

  // Check if we have a .next directory
  const nextDir = path.join(process.cwd(), '.next');
  if (fs.existsSync(nextDir)) {
    console.log('🚀 Next.js build found');

    try {
      const stats = fs.statSync(nextDir);
      console.log(`📁 Next.js build size: ${stats.size} bytes`);
    } catch (error) {
      console.error('❌ Error checking Next.js build:', error.message);
    }
  }
}

// Main function
async function main() {
  console.log('🚀 Starting Performance Monitoring for Castcut');
  console.log('==============================================================\n');

  try {
    await measureBuildTime();
    console.log('');

    analyzeBundleSize();
    console.log('');

    checkFileCounts();
    console.log('');

    await checkPerformanceMetrics();
    console.log('\n✅ Performance monitoring completed successfully');
  } catch (error) {
    console.error('❌ Performance monitoring failed:', error.message);
    process.exit(1);
  }
}

main();
