// /api/proxy.js
export const config = { runtime: 'edge' };

const ALLOW_LIST = new Set([
  'www.waze.com',
  'm.highwaysengland.co.uk',
  'nationalhighways.co.uk'
]);

function isAllowed(targetUrl) {
  try {
    const u = new URL(targetUrl);
    return ALLOW_LIST.has(u.hostname);
  } catch {
    return false;
  }
}

const baseCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Vary': 'Origin'
};

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get('url');

  // Preflight for browser requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: baseCors });
  }

  if (!target) {
    return new Response(JSON.stringify({ error: 'Missing ?url=' }), {
      status: 400,
      headers: { ...baseCors, 'Content-Type': 'application/json' }
    });
  }

  if (!isAllowed(target)) {
    return new Response(JSON.stringify({ error: 'Host not allowed', target }), {
      status: 403,
      headers: { ...baseCors, 'Content-Type': 'application/json' }
    });
  }

  try {
    const upstream = await fetch(target, {
      headers: { 'User-Agent': 'TfGM-OCC-Map/1.0' }
    });

    // Forward upstream headers and merge CORS
    const headers = new Headers(upstream.headers);
    Object.entries(baseCors).forEach(([k, v]) => headers.set(k, v));

    return new Response(upstream.body, {
      status: upstream.status,
      headers
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Proxy error', detail: String(e?.message || e) }),
      {
        status: 500,
        headers: { ...baseCors, 'Content-Type': 'application/json' }
      }
    );
  }
}
