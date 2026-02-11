export default async function handler(req, res) {
  const target = req.query.url;
  if (!target) return res.status(400).send("Missing ?url=");

  const r = await fetch(target, {
    headers: { "User-Agent": "TfGM-OCC-Map" }
  });

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(r.status);
  r.body.pipe(res);
}
