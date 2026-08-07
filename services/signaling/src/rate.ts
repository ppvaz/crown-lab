
import { createHash, randomBytes } from 'node:crypto';

const SALT = randomBytes(32);

export const addressKey = (address: string): string =>
  createHash('sha256').update(SALT).update(address).digest('hex').slice(0, 16);

interface Bucket {
  tokens: number;
  lastMs: number;
}

export interface BucketRule {
  capacity: number;
  refillPerSecond: number;
}

export const perMinute = (count: number): BucketRule => ({
  capacity: count,
  refillPerSecond: count / 60,
});

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  private readonly rule: BucketRule;

  private readonly maxKeys: number;

  constructor(rule: BucketRule, maxKeys: number) {
    this.rule = rule;
    this.maxKeys = maxKeys;
  }

  take(key: string, nowMs: number): boolean {
    const existing = this.buckets.get(key);
    if (existing === undefined) {
      if (this.buckets.size >= this.maxKeys) return false;
      this.buckets.set(key, { tokens: this.rule.capacity - 1, lastMs: nowMs });
      return true;
    }

    const elapsedSeconds = Math.max(0, nowMs - existing.lastMs) / 1000;
    existing.tokens = Math.min(
      this.rule.capacity,
      existing.tokens + elapsedSeconds * this.rule.refillPerSecond,
    );
    existing.lastMs = nowMs;

    if (existing.tokens < 1) return false;
    existing.tokens -= 1;
    return true;
  }

  forget(key: string): void {
    this.buckets.delete(key);
  }

  sweep(nowMs: number): void {
    for (const [key, bucket] of this.buckets) {
      const elapsedSeconds = Math.max(0, nowMs - bucket.lastMs) / 1000;
      const tokens = bucket.tokens + elapsedSeconds * this.rule.refillPerSecond;
      if (tokens >= this.rule.capacity) this.buckets.delete(key);
    }
  }

  get size(): number {
    return this.buckets.size;
  }
}

export class Tally {
  private readonly counts = new Map<string, number>();

  claim(key: string, limit: number, maxKeys: number): boolean {
    const held = this.counts.get(key) ?? 0;
    if (held >= limit) return false;
    if (held === 0 && this.counts.size >= maxKeys) return false;
    this.counts.set(key, held + 1);
    return true;
  }

  release(key: string): void {
    const held = this.counts.get(key);
    if (held === undefined) return;
    if (held <= 1) this.counts.delete(key);
    else this.counts.set(key, held - 1);
  }

  get(key: string): number {
    return this.counts.get(key) ?? 0;
  }

  get size(): number {
    return this.counts.size;
  }
}
