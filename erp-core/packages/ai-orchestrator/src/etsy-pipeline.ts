// Etsy Pipeline — Vision → Image → Listing → Publish
// Stub — to be implemented

import { LLMGateway } from "./llm-gateway.js";
import { ToolRouter } from "./tool-router.js";
import { BrowserUse } from "./browser-use.js";

export class EtsyPipeline {
  private llmGateway: LLMGateway;
  private toolRouter: ToolRouter;
  private browserUse: BrowserUse;
  private configured: boolean;

  constructor(llmGateway: LLMGateway, toolRouter: ToolRouter, browserUse: BrowserUse) {
    this.llmGateway = llmGateway;
    this.toolRouter = toolRouter;
    this.browserUse = browserUse;
    this.configured = !!process.env.ETSY_API_KEY;
  }

  isConfigured(): boolean {
    return this.configured;
  }
}
