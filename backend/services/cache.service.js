/**
 * Cache Service
 * Provides in-memory caching for API responses and release catalog metadata.
 */

class CacheService {
    constructor() {
        this.cache = new Map();
    }

    get(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;

        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        return entry.value;
    }

    set(key, value, ttlMs = 6 * 60 * 60 * 1000) {
        const expiresAt = ttlMs ? Date.now() + ttlMs : null;
        this.cache.set(key, { value, expiresAt });
    }

    delete(key) {
        this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
    }
}

module.exports = new CacheService();
