// OpenHands Bridge — REST API + Browser fallback for OpenHands collaboration
// Stub — to be implemented

import { BrowserUse } from "./browser-use.js";
import { LLMGateway } from "./llm-gateway.js";

export class OpenHandsBridge {
  private browserUse: BrowserUse;
  private llmGateway: LLMGateway;
  private configured: boolean;

  constructor(browserUse: BrowserUse, llmGateway: LLMGateway) {
    this.browserUse = browserUse;
    this.llmGateway = llmGateway;
    this.configured = !!process.env.OPENHANDS_URL;
  }

  isConfigured(): boolean {
    return this.configured;
  }

  getConfig(): { url: string; apiKey: string } {
    return {
      url: process.env.OPENHANDS_URL || "",
      apiKey: process.env.OPENHANDS_API_KEY || "",
    };
  }
}
