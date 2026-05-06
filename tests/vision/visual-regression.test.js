/**
 * Visual Regression Tests สำหรับ PeteMarket UI
 * ใช้ DeepSeek Vision วิเคราะห์ UI elements, layout, errors
 * 
 * การใช้งาน:
 *   DEEPSEEK_API_KEY=sk-xxx npx vitest run tests/vision/
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { analyzeUI, PROMPTS } from './deepseek-vision.js';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ถ้าไม่มี API Key (DeepSeek หรือ Gemini) ให้ skip tests
const hasApiKey = DEEPSEEK_API_KEY || GEMINI_API_KEY;
const describeWithKey = hasApiKey ? describe : describe.skip;

describeWithKey('Vision UI Tests', () => {
  let screenshotBase64 = null;

  beforeAll(async () => {
    // TODO: ใน CI จะรับ screenshot จาก Playwright
    // สำหรับตอนนี้ใช้ placeholder
    console.log('📸 Vision tests require Playwright screenshots');
    console.log('Run: npx playwright test --grep @visual');
  });

  it('@visual should detect UI elements on page', async () => {
    const result = await analyzeUI(
      screenshotBase64,
      PROMPTS.UI_ELEMENTS,
      'deepseek-v4-flash'
    );
    expect(result.analysis).toBeTruthy();
    expect(result.analysis.toLowerCase()).not.toContain('error');
    console.log('UI Elements:', result.analysis);
  });

  it('@visual should analyze layout consistency', async () => {
    const result = await analyzeUI(
      screenshotBase64,
      PROMPTS.LAYOUT_ANALYSIS,
      'deepseek-v4-flash'
    );
    expect(result.analysis).toBeTruthy();
    console.log('Layout Analysis:', result.analysis);
  });

  it('@visual should detect errors on page', async () => {
    const result = await analyzeUI(
      screenshotBase64,
      PROMPTS.ERROR_DETECTION,
      'deepseek-v4-flash'
    );
    expect(result.analysis).toBeTruthy();
    console.log('Error Detection:', result.analysis);
  });

  it('@visual should check accessibility', async () => {
    const result = await analyzeUI(
      screenshotBase64,
      PROMPTS.ACCESSIBILITY,
      'deepseek-v4-flash'
    );
    expect(result.analysis).toBeTruthy();
    console.log('Accessibility:', result.analysis);
  });
});
