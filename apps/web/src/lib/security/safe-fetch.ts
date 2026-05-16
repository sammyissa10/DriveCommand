/**
 * SSRF-safe fetch wrapper.
 *
 * Resolves the target hostname via DNS and checks all returned addresses
 * against private/reserved IP ranges before allowing the request.
 * Also enforces a request timeout and response size cap.
 *
 * Part of quick-349 input/upload abuse hardening (Section 4A.3).
 */

import dns from 'node:dns/promises';

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

// ─── Private IP detection (no external deps) ───────────────────────────────

function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function inCidr(ip: string, cidr: string): boolean {
  const [base, bits] = cidr.split('/');
  const mask = bits ? (~0 << (32 - parseInt(bits, 10))) >>> 0 : 0xffffffff;
  return (ipToNumber(ip) & mask) === (ipToNumber(base) & mask);
}

const IPV4_PRIVATE_RANGES = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '127.0.0.0/8',
  '169.254.0.0/16', // link-local / AWS metadata
  '0.0.0.0/8',
  '100.64.0.0/10',  // Carrier-grade NAT
  '198.51.100.0/24', // TEST-NET
  '203.0.113.0/24',  // TEST-NET
  '240.0.0.0/4',    // Reserved
];

function isPrivateIpv4(ip: string): boolean {
  return IPV4_PRIVATE_RANGES.some((cidr) => inCidr(ip, cidr));
}

function isPrivateIpv6(ip: string): boolean {
  // Normalize the address for comparison
  const lower = ip.toLowerCase();
  // Loopback
  if (lower === '::1') return true;
  // Unique local (fc00::/7)
  const firstOctetGroup = parseInt(lower.split(':')[0] || '0', 16);
  if ((firstOctetGroup & 0xfe00) === 0xfc00) return true;
  // Link-local (fe80::/10)
  if ((firstOctetGroup & 0xffc0) === 0xfe80) return true;
  // Unspecified / loopback
  if (lower === '::' || lower === '::1') return true;
  return false;
}

function isPrivateIp(address: string, family: number): boolean {
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return false;
}

// ─── safeFetch ─────────────────────────────────────────────────────────────

export interface SafeFetchOptions extends RequestInit {
  /** Hostnames that skip the private-IP check (trusted partners). */
  allowedHostnames?: string[];
  /** Request timeout in milliseconds. Default: 10 000 */
  timeoutMs?: number;
  /** Maximum response body size in bytes. Default: 10 MB */
  maxBytes?: number;
}

/**
 * SSRF-safe fetch.
 *
 * 1. Validates the URL protocol (https only; http allowed for localhost in dev).
 * 2. Resolves the hostname via DNS and blocks private/reserved IPs.
 * 3. Enforces a request timeout (default 10s).
 * 4. Caps response body size (default 10 MB).
 * 5. Uses `redirect: 'manual'` to prevent redirect-to-private-IP attacks.
 */
export async function safeFetch(
  url: string,
  options?: SafeFetchOptions
): Promise<Response> {
  const { allowedHostnames, timeoutMs = 10_000, maxBytes = 10_485_760, ...fetchOptions } = options ?? {};

  // 1. Parse URL — throws on invalid
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SsrfError(`Invalid URL: ${url}`);
  }

  // 2. Protocol check
  if (parsed.protocol !== 'https:') {
    const isLocalhost =
      parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    const isDev = process.env.NODE_ENV !== 'production';
    if (!(isLocalhost && isDev)) {
      throw new SsrfError(`Protocol ${parsed.protocol} not allowed — only https`);
    }
  }

  // 3. DNS + private IP check (skip for trusted hostnames)
  if (!allowedHostnames?.includes(parsed.hostname)) {
    let addrs: Array<{ address: string; family: number }>;
    try {
      const raw = await dns.lookup(parsed.hostname, { all: true });
      addrs = Array.isArray(raw) ? raw : [raw as { address: string; family: number }];
    } catch (err) {
      throw new SsrfError(`DNS resolution failed for ${parsed.hostname}: ${(err as Error).message}`);
    }

    for (const addr of addrs) {
      if (isPrivateIp(addr.address, addr.family)) {
        throw new SsrfError(`SSRF: ${parsed.hostname} resolves to private IP ${addr.address}`);
      }
    }
  }

  // 4. Timeout via AbortController
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      redirect: 'manual', // Prevent redirect-to-private-IP
    });
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === 'AbortError') {
      throw new SsrfError(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  // 5. Cap response body size
  if (!response.body) {
    return response;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          reader.cancel();
          throw new SsrfError(`Response from ${url} exceeded ${maxBytes} byte cap`);
        }
        chunks.push(value);
      }
    }
  } catch (err) {
    reader.cancel().catch(() => {});
    throw err;
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new Response(combined, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
