/**
 * Ouroboros Enhanced Browser Plugin
 *
 * Upgrades OpenClaw's browser automation with stealth mode:
 * - Anti-detection (removes webdriver flags, realistic fingerprinting)
 * - Stealth launch arguments
 * - Realistic user agent
 * - Markdown page extraction
 * - Screenshot capture with base64 output
 *
 * This enhances (not replaces) OpenClaw's existing browser tool.
 * Use ouroboros_browse for stealth browsing when anti-detection matters.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import {
  STEALTH_ARGS,
  STEALTH_USER_AGENT,
  STEALTH_INIT_SCRIPT,
  MARKDOWN_EXTRACT_JS,
} from "./stealth.js";

// Track browser state per plugin instance
let browserInstance: any = null;
let pageInstance: any = null;

async function ensureBrowser(): Promise<any> {
  if (pageInstance) {
    try {
      // Check if page is still alive
      await pageInstance.title();
      return pageInstance;
    } catch {
      // Page died, recreate
      browserInstance = null;
      pageInstance = null;
    }
  }

  // Dynamic import playwright (may not be installed)
  let playwright: any;
  try {
    playwright = await import("playwright");
  } catch {
    throw new Error(
      "Playwright not installed. Run: npm install playwright && npx playwright install chromium",
    );
  }

  browserInstance = await playwright.chromium.launch({
    headless: true,
    args: STEALTH_ARGS,
  });

  pageInstance = await browserInstance.newPage({
    viewport: { width: 1920, height: 1080 },
    userAgent: STEALTH_USER_AGENT,
  });

  // Inject stealth scripts before any page loads
  await pageInstance.addInitScript(STEALTH_INIT_SCRIPT);
  pageInstance.setDefaultTimeout(30000);

  return pageInstance;
}

async function closeBrowser(): Promise<void> {
  try {
    if (pageInstance) await pageInstance.close();
  } catch { /* ignore */ }
  try {
    if (browserInstance) await browserInstance.close();
  } catch { /* ignore */ }
  pageInstance = null;
  browserInstance = null;
}

const ouroborosBrowserPlugin = {
  id: "ouroboros-browser",
  name: "Ouroboros Stealth Browser",
  description:
    "Enhanced browser automation with anti-detection stealth mode",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    api.logger.info("ouroboros-browser: plugin registered (stealth mode)");

    // ========================================================================
    // Tools
    // ========================================================================

    api.registerTool(
      {
        name: "ouroboros_browse",
        label: "Stealth Browse",
        description:
          "Open a URL in stealth headless browser with anti-detection. Returns content as text, markdown, html, or screenshot. Use this when sites block automated browsers.",
        parameters: Type.Object({
          url: Type.String({ description: "URL to open" }),
          output: Type.Optional(
            Type.Union([
              Type.Literal("text"),
              Type.Literal("markdown"),
              Type.Literal("html"),
              Type.Literal("screenshot"),
            ]),
          ),
          waitFor: Type.Optional(
            Type.String({
              description: "CSS selector to wait for before extraction",
            }),
          ),
          timeout: Type.Optional(
            Type.Number({
              description: "Page load timeout in ms (default: 30000)",
            }),
          ),
        }),
        async execute(_toolCallId, params) {
          const {
            url,
            output = "text",
            waitFor,
            timeout = 30000,
          } = params as {
            url: string;
            output?: string;
            waitFor?: string;
            timeout?: number;
          };

          try {
            const page = await ensureBrowser();
            await page.goto(url, {
              timeout,
              waitUntil: "domcontentloaded",
            });

            if (waitFor) {
              await page.waitForSelector(waitFor, { timeout });
            }

            let content: string;

            if (output === "screenshot") {
              const buffer = await page.screenshot({
                type: "png",
                fullPage: false,
              });
              const b64 = buffer.toString("base64");
              content = `Screenshot captured (${b64.length} bytes base64). Data: ${b64.slice(0, 100)}...`;
            } else if (output === "html") {
              const html = await page.content();
              content =
                html.slice(0, 50000) +
                (html.length > 50000 ? "... [truncated]" : "");
            } else if (output === "markdown") {
              const md = await page.evaluate(MARKDOWN_EXTRACT_JS);
              content =
                md.slice(0, 30000) +
                (md.length > 30000 ? "... [truncated]" : "");
            } else {
              const text = await page.innerText("body");
              content =
                text.slice(0, 30000) +
                (text.length > 30000 ? "... [truncated]" : "");
            }

            return {
              content: [{ type: "text", text: content }],
              details: {
                url,
                outputType: output,
                length: content.length,
              },
            };
          } catch (err) {
            return {
              content: [
                {
                  type: "text",
                  text: `Browser error: ${String(err)}`,
                },
              ],
              details: { error: String(err) },
            };
          }
        },
      },
      { name: "ouroboros_browse" },
    );

    api.registerTool(
      {
        name: "ouroboros_browser_action",
        label: "Stealth Browser Action",
        description:
          "Perform action on current stealth browser page: click, fill, select, screenshot, evaluate JS, or scroll.",
        parameters: Type.Object({
          action: Type.Union([
            Type.Literal("click"),
            Type.Literal("fill"),
            Type.Literal("select"),
            Type.Literal("screenshot"),
            Type.Literal("evaluate"),
            Type.Literal("scroll"),
          ]),
          selector: Type.Optional(
            Type.String({ description: "CSS selector for click/fill/select" }),
          ),
          value: Type.Optional(
            Type.String({
              description:
                "Value for fill/select, JS for evaluate, direction for scroll (up/down/top/bottom)",
            }),
          ),
        }),
        async execute(_toolCallId, params) {
          const { action, selector, value } = params as {
            action: string;
            selector?: string;
            value?: string;
          };

          try {
            const page = await ensureBrowser();

            let result: string;

            switch (action) {
              case "click":
                if (!selector) {
                  result = "Error: selector required for click";
                  break;
                }
                await page.click(selector, { timeout: 5000 });
                await page.waitForTimeout(500);
                result = `Clicked: ${selector}`;
                break;

              case "fill":
                if (!selector) {
                  result = "Error: selector required for fill";
                  break;
                }
                await page.fill(selector, value ?? "", { timeout: 5000 });
                result = `Filled ${selector} with: ${value}`;
                break;

              case "select":
                if (!selector) {
                  result = "Error: selector required for select";
                  break;
                }
                await page.selectOption(selector, value ?? "", {
                  timeout: 5000,
                });
                result = `Selected ${value} in ${selector}`;
                break;

              case "screenshot": {
                const buffer = await page.screenshot({
                  type: "png",
                  fullPage: false,
                });
                const b64 = buffer.toString("base64");
                result = `Screenshot captured (${b64.length} bytes base64).`;
                break;
              }

              case "evaluate":
                if (!value) {
                  result = "Error: value (JS code) required for evaluate";
                  break;
                }
                const evalResult = await page.evaluate(value);
                const out = String(evalResult);
                result =
                  out.slice(0, 20000) +
                  (out.length > 20000 ? "... [truncated]" : "");
                break;

              case "scroll": {
                const dir = value ?? "down";
                const scrollMap: Record<string, string> = {
                  down: "window.scrollBy(0, 600)",
                  up: "window.scrollBy(0, -600)",
                  top: "window.scrollTo(0, 0)",
                  bottom:
                    "window.scrollTo(0, document.body.scrollHeight)",
                };
                await page.evaluate(
                  scrollMap[dir] ?? "window.scrollBy(0, 600)",
                );
                result = `Scrolled ${dir}`;
                break;
              }

              default:
                result = `Unknown action: ${action}`;
            }

            return {
              content: [{ type: "text", text: result }],
              details: { action, selector, value },
            };
          } catch (err) {
            return {
              content: [
                {
                  type: "text",
                  text: `Browser action error: ${String(err)}`,
                },
              ],
              details: { error: String(err) },
            };
          }
        },
      },
      { name: "ouroboros_browser_action" },
    );

    // ========================================================================
    // Service — cleanup browser on shutdown
    // ========================================================================

    api.registerService({
      id: "ouroboros-browser",
      start: () => {
        api.logger.info("ouroboros-browser: stealth browser ready");
      },
      stop: async () => {
        await closeBrowser();
        api.logger.info("ouroboros-browser: browser closed");
      },
    });
  },
};

export default ouroborosBrowserPlugin;
