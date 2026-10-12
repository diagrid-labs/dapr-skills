const pending: Array<{ name: string; value: number }> = [];

export function recordMetric(name: string, value: number): void {
  pending.push({ name, value });
}

export function startMetricsFlusher(): void {
  // Drain the in-process metric buffer to stdout every 2 seconds.
  setInterval(() => {
    while (pending.length > 0) {
      const metric = pending.shift()!;
      console.log(`metric ${metric.name}=${metric.value}`);
    }
  }, 2000);
}
