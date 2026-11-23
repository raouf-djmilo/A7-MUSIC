import { Image } from 'expo-image';

/**
 * ⚡ Image Preload Engine (Exclusively expo-image)
 * - Prevents gray placeholders by pre-caching album artwork into memory-disk.
 * - STRICT RULE: Never runs in Frame 0 / App Launch. Always deferred.
 * - De-duplicates URLs to avoid redundant network tasks.
 */
class ImagePreloadEngine {
  private preloadedUrls: Set<string> = new Set();
  private hasScheduledIdlePrefetch: boolean = false;

  /**
   * Safely prefetches an array of URLs using expo-image.
   */
  public async prefetchBatch(urls: (string | null | undefined)[]): Promise<void> {
    const validUrls = urls.filter(
      (u): u is string =>
        typeof u === 'string' &&
        u.startsWith('http') &&
        !this.preloadedUrls.has(u)
    );

    if (validUrls.length === 0) return;

    validUrls.forEach((u) => this.preloadedUrls.add(u));

    try {
      await Promise.all(
        validUrls.map((url) =>
          Image.prefetch(url, 'memory-disk').catch(() => {
            // Silently ignore individual prefetch failure
          })
        )
      );
    } catch {
      // Safe fallback
    }
  }

  /**
   * Schedules prefetch strictly AFTER user interactions / app idle.
   * Ensures zero contention with initial dashboard mounting and audio startup.
   */
  public scheduleDeferredPrefetch(urls: (string | null | undefined)[], delayMs: number = 2000): void {
    if (this.hasScheduledIdlePrefetch && urls.length === 0) return;

    setTimeout(() => {
      requestAnimationFrame(() => {
        this.prefetchBatch(urls);
        this.hasScheduledIdlePrefetch = true;
      });
    }, delayMs);
  }
}

export const imagePreloadEngine = new ImagePreloadEngine();
export default imagePreloadEngine;
