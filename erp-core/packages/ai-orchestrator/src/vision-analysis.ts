// ============================================================
// Vision Analysis — ให้ Agent "เห็น" และวิเคราะห์รูปภาพ
//
// รองรับ:
// - GPT-4V (OpenAI)
// - Claude 3.5 Sonnet (Anthropic)
// - Gemini 2.5 Flash (Google)
// - fallback: image captioning ด้วย Ollama (llava)
// ============================================================

export interface VisionAnalysisResult {
  success: boolean;
  description: string;
  composition?: {
    subject: string;
    background: string;
    framing: string;
    perspective: string;
  };
  colorAnalysis?: {
    dominantColors: string[];
    palette: string[];
    mood: string;
    contrast: string;
  };
  lighting?: {
    type: string;
    direction: string;
    quality: string;
  };
  style?: {
    category: string;
    techniques: string[];
    influences: string[];
  };
  suggestions?: string[];
  stylePrompt?: string;
  error?: string;
  provider: string;
}

export interface VisionAnalysisParams {
  imageBase64: string;
  mimeType?: string;
  question?: string;
  provider?: "openai" | "anthropic" | "gemini" | "ollama";
}

export class VisionAnalysis {
  private openaiApiKey: string;
  private anthropicApiKey: string;
  private geminiApiKey: string;

  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY || "";
    this.anthropicApiKey = process.env.ANTHROPIC_API_KEY || "";
    this.geminiApiKey = process.env.GEMINI_API_KEY || "";
  }

  isConfigured(): boolean {
    return !!(this.openaiApiKey || this.anthropicApiKey || this.geminiApiKey);
  }

  async analyze(params: VisionAnalysisParams): Promise<VisionAnalysisResult> {
    const provider = params.provider || this.defaultProvider();
    switch (provider) {
      case "openai": return this.analyzeWithGPT4V(params);
      case "anthropic": return this.analyzeWithClaude(params);
      case "gemini": return this.analyzeWithGemini(params);
      case "ollama": return this.analyzeWithOllama(params);
      default: return { success: false, description: "", error: `Unknown provider: ${provider}`, provider };
    }
  }

  private defaultProvider(): "openai" | "anthropic" | "gemini" | "ollama" {
    if (this.openaiApiKey) return "openai";
    if (this.anthropicApiKey) return "anthropic";
    if (this.geminiApiKey) return "gemini";
    return "ollama";
  }

  // ─── GPT-4V ────────────────────────────────────────────

  private async analyzeWithGPT4V(params: VisionAnalysisParams): Promise<VisionAnalysisResult> {
    if (!this.openaiApiKey) return this.fallback("OpenAI API key not configured");
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.openaiApiKey}` },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: this.buildAnalysisPrompt() },
            {
              role: "user",
              content: [
                { type: "text", text: params.question || "Analyze this image in detail." },
                { type: "image_url", image_url: { url: `data:${params.mimeType || "image/png"};base64,${params.imageBase64}`, detail: "high" } },
              ],
            },
          ],
          max_tokens: 2048,
          temperature: 0.3,
        }),
      });
      if (!res.ok) throw new Error(`GPT-4V error (${res.status}): ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      return this.parseResponse(data.choices?.[0]?.message?.content || "", "gpt-4o");
    } catch (err: any) {
      return this.fallback(err.message);
    }
  }

  // ─── Claude 3.5 Sonnet ─────────────────────────────────

  private async analyzeWithClaude(params: VisionAnalysisParams): Promise<VisionAnalysisResult> {
    if (!this.anthropicApiKey) return this.fallback("Anthropic API key not configured");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": this.anthropicApiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          system: this.buildAnalysisPrompt(),
          messages: [{
            role: "user",
            content: [
              { type: "text", text: params.question || "Analyze this image in detail." },
              { type: "image", source: { type: "base64", media_type: params.mimeType || "image/png", data: params.imageBase64 } },
            ],
          }],
          max_tokens: 2048,
          temperature: 0.3,
        }),
      });
      if (!res.ok) throw new Error(`Claude error (${res.status}): ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      return this.parseResponse(data.content?.[0]?.text || "", "claude-3.5-sonnet");
    } catch (err: any) {
      return this.fallback(err.message);
    }
  }

  // ─── Gemini 2.5 Flash ──────────────────────────────────

  private async analyzeWithGemini(params: VisionAnalysisParams): Promise<VisionAnalysisResult> {
    if (!this.geminiApiKey) return this.fallback("Gemini API key not configured");
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: params.question || "Analyze this image in detail." },
                { inlineData: { mimeType: params.mimeType || "image/png", data: params.imageBase64 } },
              ],
            }],
            systemInstruction: { parts: [{ text: this.buildAnalysisPrompt() }] },
            generationConfig: { maxOutputTokens: 2048, temperature: 0.3 },
          }),
        },
      );
      if (!res.ok) throw new Error(`Gemini error (${res.status}): ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("\n") || "";
      return this.parseResponse(text, "gemini-2.5-flash");
    } catch (err: any) {
      return this.fallback(err.message);
    }
  }

  // ─── Ollama (local) ────────────────────────────────────

  private async analyzeWithOllama(params: VisionAnalysisParams): Promise<VisionAnalysisResult> {
    try {
      const res = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llava",
          messages: [{ role: "user", content: params.question || "Describe this image in detail.", images: [params.imageBase64] }],
          stream: false,
        }),
      });
      if (!res.ok) throw new Error(`Ollama error (${res.status}): ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      return this.parseResponse(data.message?.content || "", "llava");
    } catch (err: any) {
      return this.fallback(err.message);
    }
  }

  // ─── Prompt & Parse ────────────────────────────────────

  private buildAnalysisPrompt(): string {
    return `You are an expert art critic and product photographer. Analyze images in detail.

Return analysis in this exact JSON structure:
{
  "description": "Brief overall description",
  "composition": { "subject": "Main subject", "background": "Background", "framing": "How framed", "perspective": "Angle" },
  "colorAnalysis": { "dominantColors": ["c1","c2"], "palette": ["hex1","hex2"], "mood": "Mood", "contrast": "High/medium/low" },
  "lighting": { "type": "natural/studio/dramatic/soft/mixed", "direction": "Direction", "quality": "Quality" },
  "style": { "category": "watercolor/oil-painting/digital-art/photography/mixed-media", "techniques": ["t1"], "influences": ["i1"] },
  "suggestions": ["Improvement suggestion"],
  "stylePrompt": "Detailed prompt to recreate this style"
}

Be specific. Focus on what makes this image unique.`;
  }

  private parseResponse(content: string, provider: string): VisionAnalysisResult {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { success: true, description: content.slice(0, 2000), provider };
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        success: true,
        description: parsed.description || content.slice(0, 500),
        composition: parsed.composition,
        colorAnalysis: parsed.colorAnalysis,
        lighting: parsed.lighting,
        style: parsed.style,
        suggestions: parsed.suggestions,
        stylePrompt: parsed.stylePrompt,
        provider,
      };
    } catch {
      return { success: true, description: content.slice(0, 2000), provider };
    }
  }

  private fallback(error: string): VisionAnalysisResult {
    return { success: false, description: "", error, provider: "none" };
  }

  /** สร้าง style prompt สำหรับ Image Generation จากผลวิเคราะห์ */
  buildStylePrompt(analysis: VisionAnalysisResult): string {
    if (analysis.stylePrompt) return analysis.stylePrompt;
    const parts: string[] = [];
    if (analysis.style) {
      parts.push(`Style: ${analysis.style.category}`);
      if (analysis.style.techniques.length) parts.push(`Techniques: ${analysis.style.techniques.join(", ")}`);
    }
    if (analysis.colorAnalysis) {
      parts.push(`Colors: ${analysis.colorAnalysis.dominantColors.join(", ")}`);
      parts.push(`Mood: ${analysis.colorAnalysis.mood}`);
    }
    if (analysis.lighting) parts.push(`Lighting: ${analysis.lighting.type}, ${analysis.lighting.direction}`);
    if (analysis.composition) {
      parts.push(`Subject: ${analysis.composition.subject}`);
      parts.push(`Background: ${analysis.composition.background}`);
    }
    return parts.join(". ") || "No style information available";
  }
}
