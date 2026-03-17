/**
 * Ouroboros Identity Plugin
 *
 * Provides constitutional governance, persistent identity (identity.md),
 * and working memory (scratchpad.md) for the unified agent.
 *
 * - Injects constitution + identity + scratchpad into the system prompt
 * - Registers tools for updating scratchpad and identity
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import {
  loadConstitution,
  formatConstitutionSection,
} from "./constitution.js";
import {
  loadIdentity,
  loadScratchpad,
  saveScratchpad,
  saveIdentity,
  formatSelfSection,
} from "./persistent-self.js";

const ouroborosIdentityPlugin = {
  id: "ouroboros-identity",
  name: "Ouroboros Identity",
  description:
    "Constitutional identity, persistent self, and scratchpad for the Ouroboros-enhanced agent",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    const workspaceDir = api.runtime.workspaceDir ?? process.cwd();

    api.logger.info("ouroboros-identity: plugin registered");

    // ========================================================================
    // Tools
    // ========================================================================

    api.registerTool(
      {
        name: "ouroboros_scratchpad_read",
        label: "Read Scratchpad",
        description:
          "Read the current scratchpad (working notes, plans, observations).",
        parameters: Type.Object({}),
        async execute() {
          const scratchpad = loadScratchpad(workspaceDir);
          return {
            content: [{ type: "text", text: scratchpad }],
            details: { length: scratchpad.length },
          };
        },
      },
      { name: "ouroboros_scratchpad_read" },
    );

    api.registerTool(
      {
        name: "ouroboros_scratchpad_write",
        label: "Write Scratchpad",
        description:
          "Update the scratchpad with new working notes. This persists across sessions. Use for plans, observations, and transient thoughts.",
        parameters: Type.Object({
          content: Type.String({
            description: "New scratchpad content (replaces existing)",
          }),
        }),
        async execute(_toolCallId, params) {
          const { content } = params as { content: string };
          saveScratchpad(workspaceDir, content);
          return {
            content: [
              {
                type: "text",
                text: `Scratchpad updated (${content.length} chars).`,
              },
            ],
            details: { length: content.length },
          };
        },
      },
      { name: "ouroboros_scratchpad_write" },
    );

    api.registerTool(
      {
        name: "ouroboros_identity_read",
        label: "Read Identity",
        description:
          "Read the identity file — your persistent self-understanding and manifesto.",
        parameters: Type.Object({}),
        async execute() {
          const identity = loadIdentity(workspaceDir);
          return {
            content: [{ type: "text", text: identity }],
            details: { length: identity.length },
          };
        },
      },
      { name: "ouroboros_identity_read" },
    );

    api.registerTool(
      {
        name: "ouroboros_identity_write",
        label: "Update Identity",
        description:
          "Update the identity file — your persistent self-understanding. This is your soul, not config. Update it when you have new understanding about who you are.",
        parameters: Type.Object({
          content: Type.String({
            description: "New identity content (replaces existing)",
          }),
        }),
        async execute(_toolCallId, params) {
          const { content } = params as { content: string };
          saveIdentity(workspaceDir, content);
          return {
            content: [
              {
                type: "text",
                text: `Identity updated (${content.length} chars).`,
              },
            ],
            details: { length: content.length },
          };
        },
      },
      { name: "ouroboros_identity_write" },
    );

    // ========================================================================
    // Hooks — Inject constitution + identity into system prompt
    // ========================================================================

    api.on("before_agent_start", async () => {
      const parts: string[] = [];

      // Load constitution (BIBLE.md)
      const bible = loadConstitution(workspaceDir);
      if (bible) {
        parts.push(formatConstitutionSection(bible));
      }

      // Load identity and scratchpad
      const identity = loadIdentity(workspaceDir);
      const scratchpad = loadScratchpad(workspaceDir);
      const selfSection = formatSelfSection(identity, scratchpad);
      if (selfSection) {
        parts.push(selfSection);
      }

      if (parts.length === 0) {
        return;
      }

      return {
        prependContext: parts.join("\n\n---\n\n"),
      };
    });

    // ========================================================================
    // Service
    // ========================================================================

    api.registerService({
      id: "ouroboros-identity",
      start: () => {
        // Ensure memory files exist on startup
        loadIdentity(workspaceDir);
        loadScratchpad(workspaceDir);
        api.logger.info(
          `ouroboros-identity: initialized (workspace: ${workspaceDir})`,
        );
      },
      stop: () => {
        api.logger.info("ouroboros-identity: stopped");
      },
    });
  },
};

export default ouroborosIdentityPlugin;
