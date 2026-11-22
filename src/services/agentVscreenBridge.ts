const VSCREEN_URL = (process.env.AGENT_VSCREEN_URL || 'http://127.0.0.1:8765').replace(/\/$/, '');

export async function captureVscreenFrame(): Promise<string | null> {
  try {
    const res = await fetch(`${VSCREEN_URL}/screenshot`, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const data: any = await res.json();
      return data.image || data.base64 || data.frame || null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 100 ? `data:image/jpeg;base64,${buf.toString('base64')}` : null;
  } catch {
    return null;
  }
}

export async function launchAppOnVscreen(appName: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${VSCREEN_URL}/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: appName, background: true }),
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
    const data: any = await res.json().catch(() => ({}));
    return { ok: true, message: data.message || `Aplicativo "${appName}" aberto na tela virtual em segundo plano.` };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'agent-vscreen inacessível' };
  }
}
