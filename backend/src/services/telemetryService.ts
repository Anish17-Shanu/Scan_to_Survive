type Sample = {
  at: number;
  method: string;
  route: string;
  status: number;
  duration_ms: number;
};

const samples: Sample[] = [];
const MAX_SAMPLES = 8000;

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const idx = Math.max(0, Math.min(sortedValues.length - 1, Math.floor((p / 100) * (sortedValues.length - 1))));
  return Number(sortedValues[idx].toFixed(2));
}

export function recordApiMetric(input: {
  method: string;
  route: string;
  status: number;
  duration_ms: number;
}) {
  samples.push({
    at: Date.now(),
    method: input.method,
    route: input.route,
    status: input.status,
    duration_ms: input.duration_ms
  });
  if (samples.length > MAX_SAMPLES) {
    samples.splice(0, samples.length - MAX_SAMPLES);
  }
}

export function getPerformanceMetrics(windowMinutes = 15) {
  const since = Date.now() - windowMinutes * 60 * 1000;
  const recent = samples.filter((s) => s.at >= since);
  const durations = recent.map((s) => s.duration_ms).sort((a, b) => a - b);
  const byRoute = new Map<string, Sample[]>();
  for (const s of recent) {
    const key = `${s.method} ${s.route}`;
    if (!byRoute.has(key)) byRoute.set(key, []);
    byRoute.get(key)?.push(s);
  }
  const routeMetrics = Array.from(byRoute.entries())
    .map(([key, rows]) => {
      const ds = rows.map((r) => r.duration_ms).sort((a, b) => a - b);
      const errors = rows.filter((r) => r.status >= 400).length;
      return {
        route: key,
        count: rows.length,
        error_rate_percent: rows.length > 0 ? Number(((errors / rows.length) * 100).toFixed(2)) : 0,
        p95_ms: percentile(ds, 95),
        p99_ms: percentile(ds, 99)
      };
    })
    .sort((a, b) => b.p95_ms - a.p95_ms)
    .slice(0, 20);

  return {
    window_minutes: windowMinutes,
    total_requests: recent.length,
    p95_ms: percentile(durations, 95),
    p99_ms: percentile(durations, 99),
    routes: routeMetrics
  };
}
