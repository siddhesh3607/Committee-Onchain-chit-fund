import { fallback, http } from 'viem';

export const FUJI_RPCS = [
  'https://avalanche-fuji-c-chain-rpc.publicnode.com',
  'https://api.avax-test.network/ext/bc/C/rpc',
];
export function fujiTransport(primary, { timeout = 6000, retryCount = 1, urls } = {}) {
  // An explicit development RPC is isolated from public-chain fallbacks.
  const endpoints = urls ?? (primary ? [primary, ...(/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(primary) ? [] : FUJI_RPCS)] : FUJI_RPCS);
  return fallback([...new Set(endpoints)].map(url => http(url, { timeout, retryCount: 0 })), { retryCount, retryDelay: 500 });
}

// Schedule only after completion. Cleanup prevents both rescheduling and stale UI writes.
export function pollSerial(task, { delay = 5000, maxDelay = 30000, schedule = setTimeout, cancel = clearTimeout } = {}) {
  let stopped = false, timer, failures = 0;
  const run = async () => {
    try { await task(() => !stopped); failures = 0; }
    catch { failures++; }
    if (!stopped) timer = schedule(run, Math.min(maxDelay, delay * 2 ** failures));
  };
  void run();
  return () => { stopped = true; cancel(timer); };
}
