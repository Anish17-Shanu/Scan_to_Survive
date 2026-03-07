import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/apiError.js";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export function rateLimit(windowMs: number, maxRequests: number) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authScope = req.headers.authorization?.slice(0, 64) ?? "anonymous";
    const key = `${req.ip}:${req.path}:${authScope}`;
    const now = Date.now();
    const existing = buckets.get(key);

    if (buckets.size > MAX_BUCKETS) {
      for (const [bucketKey, bucket] of buckets.entries()) {
        if (now > bucket.resetAt) {
          buckets.delete(bucketKey);
        }
      }
    }

    if (!existing || now > existing.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (existing.count >= maxRequests) {
      next(new ApiError(429, "Too many requests, please try again shortly"));
      return;
    }

    existing.count += 1;
    buckets.set(key, existing);
    next();
  };
}
