interface Env {
  GEMINI_API_KEY: string;
  GOOGLE_TRANSLATE_API_KEY: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function corsResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonError(message: string, status: number): Response {
  return corsResponse(
    new Response(JSON.stringify({ error: { message } }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return jsonError('Method not allowed', 405);
    }

    const url = new URL(request.url);

    if (url.pathname === '/api/gemini') {
      return corsResponse(await proxyGemini(request, env));
    }

    if (url.pathname === '/api/translate') {
      return corsResponse(await proxyTranslate(request, env));
    }

    return jsonError('Not found', 404);
  },
} satisfies ExportedHandler<Env>;

async function proxyGemini(request: Request, env: Env): Promise<Response> {
  if (!env.GEMINI_API_KEY) {
    return jsonError('GEMINI_API_KEY not configured', 500);
  }

  const body = await request.text();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

  return fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

async function proxyTranslate(request: Request, env: Env): Promise<Response> {
  if (!env.GOOGLE_TRANSLATE_API_KEY) {
    return jsonError('GOOGLE_TRANSLATE_API_KEY not configured', 500);
  }

  const body = await request.text();
  const endpoint = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(env.GOOGLE_TRANSLATE_API_KEY)}`;

  return fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
