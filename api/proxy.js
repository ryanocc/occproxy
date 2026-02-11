// /api/proxy.js  (Node serverless)

// Allow CORS preflight from the browser
function handlePreflight(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.status(204).end();
}

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return handlePreflight(req, res);

    const target = req.query.url;
    if (!target) {
      res.status(400).json({ error: 'Missing ?url=' });
      return;
    }

    // Fetch upstream (Node 18+ has global fetch in Vercel)
    const upstream = await fetch(target, {
      headers: { 'User-Agent': 'TfGM-OCC-Map/1.0' },
      // You can add caching headers or revalidation here if needed
    });

    // Mirror upstream status & content-type, but open CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Vary', 'Origin');

    // Forward content-type if present (JSON, XML, etc.)
    const ct = upstream.headers.get('content-type');
    if (ct) res.setHeader('Content-Type', ct);

    // Stream if possible; otherwise buffer
    if (upstream.body && typeof upstream.body.pipe === 'function') {
      res.status(upstream.status);
      upstream.body.pipe(res);
    } else {
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.status(upstream.status).send(buf);
    }
  } catch (e) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res
      .status(500)
      .json({ error: 'Proxy error', detail: String(e?.message || e) });
  }
}
