const rateBuckets = new Map();

function checkRateLimit(key, limit, windowMs) {
    if (!key || limit <= 0 || windowMs <= 0) {
        return { limited: false, retryAfterMs: 0, remaining: Number.MAX_SAFE_INTEGER };
    }

    const now = Date.now();
    const threshold = now - windowMs;
    const timestamps = rateBuckets.get(key) || [];

    while (timestamps.length > 0 && timestamps[0] <= threshold) {
        timestamps.shift();
    }

    if (timestamps.length >= limit) {
        const retryAfterMs = Math.max(0, windowMs - (now - timestamps[0]));
        rateBuckets.set(key, timestamps);
        return { limited: true, retryAfterMs, remaining: 0 };
    }

    timestamps.push(now);
    rateBuckets.set(key, timestamps);

    return {
        limited: false,
        retryAfterMs: 0,
        remaining: Math.max(0, limit - timestamps.length),
    };
}

setInterval(() => {
    const now = Date.now();

    for (const [key, timestamps] of rateBuckets.entries()) {
        if (!timestamps.length) {
            rateBuckets.delete(key);
            continue;
        }

        const latest = timestamps[timestamps.length - 1];
        if (now - latest > 300_000) {
            rateBuckets.delete(key);
        }
    }
}, 60_000).unref();

module.exports = {
    checkRateLimit,
};
