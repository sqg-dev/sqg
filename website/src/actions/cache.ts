import { LRUCache } from 'lru-cache';
import { type CacheEntry, type Cache, totalTtl, configure } from '@epic-web/cachified';

const lruInstance = new LRUCache<string, CacheEntry>({ max: 5000 });

const lruCache: Cache = {
  set(key, value) {
    const ttl = totalTtl(value?.metadata);
    return lruInstance.set(key, value, {
      ttl: ttl === Infinity ? undefined : ttl,
      start: value?.metadata?.createdTime,
    });
  },
  get(key) {
    return lruInstance.get(key);
  },
  delete(key) {
    return lruInstance.delete(key);
  },
};

export const cachified = configure({
    cache: lruCache,
});
  