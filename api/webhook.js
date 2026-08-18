/**
 * api/webhook.js — RouteIQ
 *
 * Proxy server-side hacia el Webhook de Power Automate. Existe para que la
 * URL real (que funciona como credencial: cualquiera que la tenga puede
 * disparar el flujo) nunca quede expuesta en index.html ni en el repo
 * público — vive solo en la variable de entorno POWER_AUTOMATE_WEBHOOK_URL,
 * configurada en el dashboard de Vercel (Project Settings → Environment
 * Variables), nunca en el código.
 *
 * El navegador llama a POST /api/webhook con el JSON del evento; esta
 * función lo reenvía tal cual a Power Automate.
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const webhookUrl = process.env.POWER_AUTOMATE_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('POWER_AUTOMATE_WEBHOOK_URL no está configurada en Vercel');
    res.status(500).json({ error: 'Webhook not configured' });
    return;
  }

  try {
    const upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
    });
    if (!upstream.ok) {
      const bodyText = await upstream.text().catch(() => '');
      console.error('Power Automate respondió', upstream.status, bodyText);
      res.status(upstream.status).json({ ok: false, upstreamStatus: upstream.status, upstreamBody: bodyText });
      return;
    }
    res.status(upstream.status).json({ ok: true });
  } catch (e) {
    console.error('Error reenviando a Power Automate:', e);
    res.status(502).json({ error: 'Upstream request failed' });
  }
};
