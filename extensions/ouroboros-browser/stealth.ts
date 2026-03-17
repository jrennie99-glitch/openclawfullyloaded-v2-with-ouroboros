/**
 * Ouroboros Stealth Browser — Anti-detection for Playwright.
 *
 * Ported from ouroboros/tools/browser.py stealth mode.
 * Applies anti-detection measures to make headless browsing
 * indistinguishable from regular browser usage.
 */

/**
 * Stealth launch arguments for Chromium.
 * These disable automation detection flags.
 */
export const STEALTH_ARGS = [
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-blink-features=AutomationControlled",
  "--disable-features=site-per-process",
  "--window-size=1920,1080",
  "--disable-infobars",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
];

/**
 * Realistic user agent string (Chrome on Windows).
 */
export const STEALTH_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * JavaScript to inject into pages to defeat navigator.webdriver detection
 * and other common fingerprinting techniques.
 */
export const STEALTH_INIT_SCRIPT = `
  // Remove webdriver flag
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

  // Override permissions API
  const originalQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (parameters) =>
    parameters.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission })
      : originalQuery(parameters);

  // Override plugins to appear non-empty
  Object.defineProperty(navigator, 'plugins', {
    get: () => [1, 2, 3, 4, 5],
  });

  // Override languages
  Object.defineProperty(navigator, 'languages', {
    get: () => ['en-US', 'en'],
  });

  // Remove Chrome automation flags
  window.chrome = { runtime: {} };

  // Override connection info
  Object.defineProperty(navigator, 'connection', {
    get: () => ({
      effectiveType: '4g',
      rtt: 50,
      downlink: 10,
      saveData: false,
    }),
  });
`;

/**
 * JavaScript to extract page content as clean markdown.
 * Same approach as ouroboros's _MARKDOWN_JS.
 */
export const MARKDOWN_EXTRACT_JS = `() => {
  const walk = (el) => {
    let out = '';
    for (const child of el.childNodes) {
      if (child.nodeType === 3) {
        const t = child.textContent.trim();
        if (t) out += t + ' ';
      } else if (child.nodeType === 1) {
        const tag = child.tagName;
        if (['SCRIPT','STYLE','NOSCRIPT'].includes(tag)) continue;
        if (['H1','H2','H3','H4','H5','H6'].includes(tag))
          out += '\\n' + '#'.repeat(parseInt(tag[1])) + ' ';
        if (tag === 'P' || tag === 'DIV' || tag === 'BR') out += '\\n';
        if (tag === 'LI') out += '\\n- ';
        if (tag === 'A') out += '[';
        out += walk(child);
        if (tag === 'A') out += '](' + (child.href||'') + ')';
      }
    }
    return out;
  };
  return walk(document.body);
}`;
