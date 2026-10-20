import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type CachedViewImage = {
  buffer: Buffer;
  contentType: string;
};

export type ViewCacheFormat = 'jpeg' | 'webp' | 'avif';

// Enhanced memory entry with access tracking for LFU eviction
interface MemoryEntry extends CachedViewImage {
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
}

// Configuration constants
const MEMORY_LIMIT = 100; // Increased from 80 to handle more items
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DISK_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_DISK_CACHE_SIZE_BYTES = 1024 * 1024 * 1024; // 1GB max disk cache

// Memory cache with LFU (Least Frequently Used) eviction policy
const memory = new Map<string, MemoryEntry>();

// Cache statistics for monitoring
let cacheStats = {
  hits: 0,
  misses: 0,
  evictions: 0,
  diskWrites: 0,
  diskReads: 0,
};

// Incremental memory size tracker — O(1) getMemorySize instead of O(M) iteration.
let totalMemoryBytes = 0;

// Total bytes occupied by surviving disk-cache files, recomputed each cleanup
// sweep. Only a snapshot as of the last sweep (not updated on individual
// writes), but that's sufficient for budget enforcement and reporting.
let lastKnownDiskBytes = 0;

// Cleanup timers
let cleanupTimer: NodeJS.Timeout | null = null;
let initialCleanupTimer: NodeJS.Timeout | null = null;

function cacheRoot(): string {
  const dataDir = process.env.PROMPT_DATA_DIR?.trim();
  if (dataDir) {
    return path.join(path.resolve(/* turbopackIgnore: true */ dataDir), 'comfy-view-cache');
  }
  return path.join(/* turbopackIgnore: true */ os.tmpdir(), 'comfyui-prompt-studio-view-cache');
}

export function buildViewCacheKey(input: {
  comfyUrl: string;
  filename: string;
  subfolder: string;
  type: string;
  width: number;
  format: ViewCacheFormat;
}): string {
  return crypto
    .createHash('sha1')
    .update(
      [
        input.comfyUrl.replace(/\/+$/, ''),
        input.filename,
        input.subfolder,
        input.type,
        String(input.width),
        input.format,
      ].join('\0')
    )
    .digest('hex');
}

function diskPaths(
  key: string,
  format: ViewCacheFormat
): {
  filePath: string;
  metaPath: string;
} {
  const root = cacheRoot();
  const shard = key.slice(0, 2);
  // Per vercel/next.js#95125: turbopackIgnore only suppresses the whole-project
  // trace bailout when it annotates a bare variable passed directly to the
  // fs/path call — annotating the path.join(...) expression itself (as this
  // used to) does not work, despite matching Next's own suggested remedy text.
  const dir = path.join(/* turbopackIgnore: true */ root, shard);
  return {
    filePath: path.join(/* turbopackIgnore: true */ dir, `${key}.${format}`),
    metaPath: path.join(/* turbopackIgnore: true */ dir, `${key}.json`),
  };
}

function touchMemory(key: string, entry: MemoryEntry): void {
  const existing = memory.get(key);
  if (existing) {
    entry.accessCount = existing.accessCount + 1;
    entry.lastAccessed = Date.now();
    // Adjust running size when replacing an entry with the same key.
    totalMemoryBytes -= existing.buffer.byteLength;
    totalMemoryBytes += entry.buffer.byteLength;
  } else {
    entry.accessCount = 1;
    entry.lastAccessed = Date.now();
    totalMemoryBytes += entry.buffer.byteLength;
  }

  memory.delete(key);
  memory.set(key, entry);

  // Apply LFU eviction when limit is exceeded
  if (memory.size > MEMORY_LIMIT) {
    evictLFU();
  }
}

function evictLFU(): void {
  if (memory.size <= MEMORY_LIMIT) return;

  // Find the entry with the lowest access count (or oldest if tied).
  // With ~100 entries this is fast, but we keep it lean.
  let leastAccessedKey: string | null = null;
  let minAccessCount = Infinity;
  let oldestTimestamp = Infinity;

  for (const [key, entry] of memory.entries()) {
    if (
      entry.accessCount < minAccessCount ||
      (entry.accessCount === minAccessCount && entry.lastAccessed < oldestTimestamp)
    ) {
      minAccessCount = entry.accessCount;
      oldestTimestamp = entry.lastAccessed;
      leastAccessedKey = key;
    }
  }

  if (leastAccessedKey) {
    const evicted = memory.get(leastAccessedKey);
    memory.delete(leastAccessedKey);
    totalMemoryBytes -= evicted?.buffer.byteLength ?? 0;
    cacheStats.evictions++;
  }
}

function getMemorySize(): number {
  // O(1) incremental tracker instead of iterating all entries.
  return totalMemoryBytes;
}

export function readViewCache(key: string, format: ViewCacheFormat): CachedViewImage | null {
  const now = Date.now();
  const mem = memory.get(key);

  if (mem && mem.expiresAt > now) {
    // Update access stats for cache hit
    touchMemory(key, mem);
    cacheStats.hits++;
    return { buffer: mem.buffer, contentType: mem.contentType };
  }

  if (mem) {
    memory.delete(key);
    totalMemoryBytes -= mem.buffer.byteLength;
  }

  try {
    const { filePath, metaPath } = diskPaths(key, format);
    const metaRaw = fs.readFileSync(/* turbopackIgnore: true */ metaPath, 'utf8');
    const meta = JSON.parse(metaRaw) as { expiresAt?: number; contentType?: string };

    if (
      typeof meta.expiresAt !== 'number' ||
      meta.expiresAt <= now ||
      typeof meta.contentType !== 'string'
    ) {
      return null;
    }

    const buffer = fs.readFileSync(/* turbopackIgnore: true */ filePath);
    const entry: MemoryEntry = {
      buffer,
      contentType: meta.contentType,
      expiresAt: meta.expiresAt,
      accessCount: 0,
      lastAccessed: Date.now(),
    };

    touchMemory(key, entry);
    cacheStats.diskReads++;
    cacheStats.hits++;
    return { buffer, contentType: meta.contentType };
  } catch {
    cacheStats.misses++;
    return null;
  }
}

export function writeViewCache(
  key: string,
  format: ViewCacheFormat,
  image: CachedViewImage,
  ttlMs = DEFAULT_TTL_MS
): void {
  const expiresAt = Date.now() + ttlMs;

  // Add to memory cache first (will be evicted if needed)
  touchMemory(key, { ...image, expiresAt, accessCount: 0, lastAccessed: Date.now() });

  try {
    const { filePath, metaPath } = diskPaths(key, format);
    const fileDir = path.dirname(/* turbopackIgnore: true */ filePath);
    fs.mkdirSync(/* turbopackIgnore: true */ fileDir, {
      recursive: true,
    });
    fs.writeFileSync(/* turbopackIgnore: true */ filePath, image.buffer);
    fs.writeFileSync(
      /* turbopackIgnore: true */ metaPath,
      JSON.stringify({ expiresAt, contentType: image.contentType })
    );
    cacheStats.diskWrites++;
  } catch {
    // Best-effort disk cache; memory entry already stored.
  }
}

// Enhanced format negotiation with better performance
export function negotiateViewFormat(acceptHeader: string | null): ViewCacheFormat {
  const accept = (acceptHeader ?? '').toLowerCase();

  // Check for preferred formats in order of preference
  if (accept.includes('image/avif')) {
    return 'avif';
  }
  if (accept.includes('image/webp')) {
    return 'webp';
  }
  // JPEG fallback
  return 'jpeg';
}

export function contentTypeForViewFormat(format: ViewCacheFormat): string {
  switch (format) {
    case 'avif':
      return 'image/avif';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}

// New utility functions for cache management
export function getCacheStats(): typeof cacheStats {
  return { ...cacheStats };
}

export function resetCacheStats(): void {
  cacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    diskWrites: 0,
    diskReads: 0,
  };
}

export function startDiskCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
  }
  if (initialCleanupTimer) {
    clearTimeout(initialCleanupTimer);
  }

  const runCleanup = () => {
    try {
      // Cleanup expired entries on disk (and evict oldest entries if the
      // surviving set is over the disk-cache byte budget).
      cleanupExpiredDiskCache();
    } catch (error) {
      console.error('Error during disk cache cleanup:', error);
    }
  };

  // Run once shortly after startup so a stale/oversized cache directory
  // (e.g. left over from before size-budget enforcement existed, or from a
  // prior process) gets trimmed promptly instead of waiting a full interval.
  initialCleanupTimer = setTimeout(runCleanup, 1000);
  initialCleanupTimer.unref();

  cleanupTimer = setInterval(runCleanup, DISK_CLEANUP_INTERVAL_MS);
  // Don't keep unit tests / CLI processes alive forever.
  cleanupTimer.unref();
}

export function stopDiskCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  if (initialCleanupTimer) {
    clearTimeout(initialCleanupTimer);
    initialCleanupTimer = null;
  }
}

export type DiskCacheFileInfo = {
  key: string;
  bytes: number;
  mtimeMs: number;
};

/**
 * Given the disk-cache files that survived TTL expiry and a byte budget,
 * returns the keys to evict — oldest (by mtime) first — so the remaining
 * total fits within `maxBytes`. Pure and side-effect free so it's testable
 * without touching the filesystem.
 */
export function selectDiskCacheEvictions(
  entries: DiskCacheFileInfo[],
  maxBytes: number
): Set<string> {
  const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  if (totalBytes <= maxBytes || entries.length === 0) {
    return new Set();
  }

  const sorted = [...entries].sort((a, b) => a.mtimeMs - b.mtimeMs);
  const evict = new Set<string>();
  let remaining = totalBytes;
  for (const entry of sorted) {
    if (remaining <= maxBytes) break;
    evict.add(entry.key);
    remaining -= entry.bytes;
  }
  return evict;
}

function cleanupExpiredDiskCache(): void {
  try {
    const root = cacheRoot();
    if (!fs.existsSync(/* turbopackIgnore: true */ root)) return;

    const now = Date.now();
    let deletedCount = 0;
    const survivors: DiskCacheFileInfo[] = [];

    // Walk through all cache files, removing expired ones and collecting
    // size/recency info for whatever survives.
    function walkDirectory(dir: string) {
      if (!fs.existsSync(/* turbopackIgnore: true */ dir)) return;

      const items = fs.readdirSync(/* turbopackIgnore: true */ dir);
      for (const item of items) {
        const fullPath = path.join(/* turbopackIgnore: true */ dir, item);
        const stat = fs.statSync(/* turbopackIgnore: true */ fullPath);

        if (stat.isDirectory()) {
          walkDirectory(fullPath);
        } else if (item.endsWith('.json')) {
          // This is a metadata file
          try {
            const metaRaw = fs.readFileSync(/* turbopackIgnore: true */ fullPath, 'utf8');
            const meta = JSON.parse(metaRaw) as { expiresAt?: number };
            const key = item.replace(/\.json$/, '');

            if (typeof meta.expiresAt === 'number' && meta.expiresAt <= now) {
              // Delete metadata and any format sibling (jpeg/webp/avif).
              for (const format of ['jpeg', 'webp', 'avif'] as const) {
                const { filePath } = diskPaths(key, format);
                if (fs.existsSync(/* turbopackIgnore: true */ filePath)) {
                  fs.unlinkSync(/* turbopackIgnore: true */ filePath);
                }
              }
              fs.unlinkSync(/* turbopackIgnore: true */ fullPath);
              deletedCount++;
              continue;
            }

            // Not expired — record its size/mtime for budget enforcement.
            // The key's hash already bakes in the format, so exactly one of
            // the three format files exists for it.
            for (const format of ['jpeg', 'webp', 'avif'] as const) {
              const { filePath } = diskPaths(key, format);
              try {
                const imageStat = fs.statSync(/* turbopackIgnore: true */ filePath);
                survivors.push({
                  key,
                  bytes: imageStat.size + stat.size,
                  mtimeMs: imageStat.mtimeMs,
                });
                break;
              } catch {
                // Not this format; try the next.
              }
            }
          } catch {
            // Skip corrupted or invalid metadata files
          }
        }
      }
    }

    walkDirectory(root);

    const evictKeys = selectDiskCacheEvictions(survivors, MAX_DISK_CACHE_SIZE_BYTES);
    for (const entry of survivors) {
      if (!evictKeys.has(entry.key)) continue;
      // metaPath is format-independent (diskPaths only uses `format` for the
      // image extension), so any format argument yields the same metaPath.
      const { metaPath } = diskPaths(entry.key, 'jpeg');
      for (const format of ['jpeg', 'webp', 'avif'] as const) {
        const { filePath: candidate } = diskPaths(entry.key, format);
        if (fs.existsSync(/* turbopackIgnore: true */ candidate)) {
          try {
            fs.unlinkSync(/* turbopackIgnore: true */ candidate);
          } catch {
            /* already gone */
          }
        }
      }
      try {
        fs.unlinkSync(/* turbopackIgnore: true */ metaPath);
      } catch {
        /* already gone */
      }
      deletedCount++;
    }

    lastKnownDiskBytes = survivors
      .filter(entry => !evictKeys.has(entry.key))
      .reduce((sum, entry) => sum + entry.bytes, 0);

    if (deletedCount > 0) {
      console.log(`Cleaned up ${deletedCount} expired/over-budget cache entries`);
    }
  } catch (error) {
    console.error('Error during disk cleanup:', error);
  }
}

function folderBytes(dir: string): number {
  let bytes = 0;
  for (const entry of fs.readdirSync(/* turbopackIgnore: true */ dir, { withFileTypes: true })) {
    const full = path.join(/* turbopackIgnore: true */ dir, entry.name);
    try {
      bytes += entry.isDirectory() ? folderBytes(full) : fs.statSync(full).size;
    } catch {
      /* vanished */
    }
  }
  return bytes;
}

/** Size of the thumbnail cache on disk now (a full walk, unlike getCacheSize's snapshot). */
export function measureViewDiskCache(): number {
  try {
    return folderBytes(cacheRoot());
  } catch {
    return 0;
  }
}

/** Empty the thumbnail cache (memory and disk). Every entry is rebuilt from ComfyUI on demand. */
export function clearViewDiskCache(): { freedBytes: number } {
  const freedBytes = measureViewDiskCache();
  memory.clear();
  totalMemoryBytes = 0;
  try {
    fs.rmSync(/* turbopackIgnore: true */ cacheRoot(), { recursive: true, force: true });
  } catch {
    /* nothing there */
  }
  lastKnownDiskBytes = 0;
  return { freedBytes };
}

export function getCacheSize(): { memory: number; disk: number } {
  return {
    memory: getMemorySize(),
    disk: lastKnownDiskBytes,
  };
}

// Initialize the cache system with automatic cleanup
startDiskCleanup();
