// Copied unchanged from SoleTasker (api/_provider.js): one retry with backoff for
// provider calls (OpenAI, Stripe), honouring Retry-After, never retrying a
// billing/quota failure.

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const retryDelay = (response, attempt) => {
  const header = response?.headers?.get?.("retry-after");
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 5000);
  const dateMs = header ? Date.parse(header) - Date.now() : NaN;
  if (Number.isFinite(dateMs) && dateMs > 0) return Math.min(dateMs, 5000);
  return Math.min(5000, 300 * (2 ** attempt) + Math.floor(Math.random() * 250));
};

export async function providerFetch(url, options, { timeoutMs = 30000, maxRetries = 1 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (response.ok) return response;
      const retryable = response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500;
      const body = await response.clone().text();
      const quotaFailure = /insufficient_quota|billing|account_deactivated|invalid_api_key/i.test(body);
      if (!retryable || quotaFailure || attempt === maxRetries) return response;
      await sleep(retryDelay(response, attempt));
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) throw error;
      await sleep(300 * (2 ** attempt) + Math.floor(Math.random() * 250));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error("Provider request failed");
}

