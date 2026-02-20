// api/waze-merged.js
// Merged Waze Partner feed + Waze TVT feed, with edge caching + CORS.

export const config = {
  runtime: "nodejs",
};

// ---- Hard-coded upstreams (your actual URLs) ----
const WAZE_PARTNER_URL =
  "https://www.waze.com/row-partnerhub-api/partners/11867436614/waze-feeds/4e8ef399-d6b9-4338-9840-7c2beacd235b?format=1";

const WAZE_TVT_URL =
  "https://www.waze.com/row-partnerhub-api/feeds-tvt/?id=1709296452339";

// ---- Cache tuning (adjust if you want) ----
// Edge cache: shared across all clients.
// s-maxage=30 means: at most 1 origin compute execution per ~30s per POP (usually less with SWR).
// stale-while-revalidate=300 means: serve stale for 5 min while refreshing in background.
const EDGE_CACHE_OK = "public, s-maxage=30, stale-while-revalidate=300";
const EDGE_CACHE_ERR = "public, s-maxage=10, stale-while-revalidate=60";

// ---- CORS helper ----
function setCors(res) {
  // Wildcard is simplest for wallboard use. If you want to lock it down later,
  // replace "*" with your GitHub Pages origin.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Vary", "Origin");
}

// ---- Fetch JSON with timeout ----
async function fetchJson(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const r = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: ctrl.signal,
      headers: { Accept: "application/json,text/plain,*/*" },
    });

    const text = await r.text();

    if (!r.ok) {
      const snip = (text || "").slice(0, 300);
      throw new Error(`Upstream HTTP ${r.status}: ${snip}`);
    }

    const trimmed = (text || "").replace(/^\uFEFF/, "").trim();
    if (!trimmed) throw new Error("Empty upstream response");

    return JSON.parse(trimmed);
  } finally {
    clearTimeout(t);
  }
}

// ---- Tiny in-function memory cache (helps hot-burst traffic) ----
let memCache = null; // { at:number, payload:any }
const MEM_TTL_MS = 10_000;

export default async function handler(req, res) {
  setCors(res);

  // Preflight for browsers
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", EDGE_CACHE_ERR);
    return res.end(JSON.stringify({ ok: false, error: "Method Not Allowed" }));
  }

  // Tell Vercel edge to cache responses (reduces Fast Origin Transfer by sharing results)
  res.setHeader("Cache-Control", EDGE_CACHE_OK);
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  // Serve short in-memory cache if very hot traffic
  const now = Date.now();
  if (memCache && now - memCache.at < MEM_TTL_MS) {
    res.statusCode = 200;
    return res.end(JSON.stringify(memCache.payload));
  }

  try {
    // Fetch both upstreams in parallel
    const [waze, tvt] = await Promise.all([
      fetchJson(WAZE_PARTNER_URL, 12000),
      fetchJson(WAZE_TVT_URL, 12000),
    ]);

    // Keep TVT small (you only need usersOnJams)
    const usersOnJams = Array.isArray(tvt?.usersOnJams) ? tvt.usersOnJams : [];

    const payload = {
      ok: true,
      fetchedAt: new Date().toISOString(),
      waze,                 // full Waze Partner JSON
      tvt: { usersOnJams }, // trimmed TVT
    };

    memCache = { at: now, payload };

    res.statusCode = 200;
    return res.end(JSON.stringify(payload));
  } catch (e) {
    // Cache errors briefly to avoid thundering-herd retry storms
    res.setHeader("Cache-Control", EDGE_CACHE_ERR);
    res.statusCode = 502;
    return res.end(
      JSON.stringify({
        ok: false,
        error: String(e?.message || e),
      })
    );
  }
}
