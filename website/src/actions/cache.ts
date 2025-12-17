import { type Cache, type CacheEntry, configure, totalTtl } from "@epic-web/cachified";
import { LRUCache } from "lru-cache";

const lruInstance = new LRUCache<string, CacheEntry>({ max: 5000 });

const lruCache: Cache = {
  set(key, value) {
    const ttl = totalTtl(value?.metadata);
    return lruInstance.set(key, value, {
      ttl: ttl === Number.POSITIVE_INFINITY ? undefined : ttl,
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
