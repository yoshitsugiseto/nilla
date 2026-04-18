/**
 * Read the CSP nonce injected by the backend into a <meta> tag.
 *
 * The backend replaces the __CSP_NONCE__ placeholder in index.html with a
 * per-request cryptographic nonce. Libraries that dynamically create <style>
 * elements (e.g. @hello-pangea/dnd) need this nonce so the browser accepts
 * those elements under the Content-Security-Policy.
 */
export function useNonce(): string | undefined {
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[property="csp-nonce"]',
  )
  const value = meta?.content
  // In dev mode or when the placeholder was not replaced, return undefined.
  if (!value || value === '__CSP_NONCE__') {
    return undefined
  }
  return value
}
