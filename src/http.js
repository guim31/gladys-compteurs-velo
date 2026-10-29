// -----------------------------------------------------------------------------
// HTTP downloads of the open data portals: a timeout on every request, a size
// cap on every body (the sandbox has 256 MB), and conditional requests
// (ETag / If-None-Match) when the server supports them.
//
// `fetch` is injectable: the tests never touch the network.
// -----------------------------------------------------------------------------

export const USER_AGENT =
  'gladys-compteurs-velo (+https://github.com/guim31/gladys-compteurs-velo)';

export class HttpError extends Error {
  constructor(message, status = null, retryAfterMs = null) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/** The Retry-After header of a 429 or a 503, in ms (seconds or an HTTP date). */
export function retryAfterMs(response) {
  const value = response.headers?.get?.('retry-after');
  if (!value) {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

/**
 * Host of a URL, for messages and logs: never the path nor the query string,
 * where some operators put a public key (`?apiKey=…`).
 */
export function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return 'unknown host';
  }
}

async function readCapped(response, url, maxBytes) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (declared > maxBytes) {
    await response.body?.cancel?.().catch(() => {});
    throw new HttpError(`${hostOf(url)}: response too large (${declared} bytes)`);
  }
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      throw new HttpError(`${hostOf(url)}: response too large`);
    }
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new HttpError(`${hostOf(url)}: response too large`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, size);
}

/**
 * GET a body into memory. With `etag`, a 304 resolves `{ notModified: true }`.
 * @returns {Promise<{ body: Buffer|null, etag: string|null, notModified: boolean }>}
 */
export async function getBuffer(
  fetchImpl,
  url,
  { timeoutMs = 20000, maxBytes = 20e6, etag = null } = {},
) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'application/json',
        ...(etag ? { 'if-none-match': etag } : {}),
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const reason = err?.name === 'TimeoutError' ? 'timeout' : (err?.cause?.code ?? err?.message);
    throw new HttpError(`${hostOf(url)}: ${reason}`);
  }
  if (response.status === 304) {
    await response.body?.cancel?.().catch(() => {});
    return { body: null, etag, notModified: true };
  }
  if (!response.ok) {
    await response.body?.cancel?.().catch(() => {});
    throw new HttpError(
      `${hostOf(url)}: HTTP ${response.status}`,
      response.status,
      retryAfterMs(response),
    );
  }
  const body = await readCapped(response, url, maxBytes);
  return { body, etag: response.headers?.get?.('etag') ?? null, notModified: false };
}

/** Parses a JSON body, or says which host sent something else. */
export function parseJson(body, url) {
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw new HttpError(`${hostOf(url)}: invalid JSON`);
  }
}

/** GET a JSON document. */
export async function getJson(fetchImpl, url, options = {}) {
  const { body } = await getBuffer(fetchImpl, url, options);
  return parseJson(body, url);
}
