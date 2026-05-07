/**
 * Playwright + DeepSeek Vision Integration Tests
 * ใช้ browser automation จับ screenshot แล้วส่งให้ DeepSeek Vision วิเคราะห์
 * 
 * รัน: DEEPSEEK_API_KEY=sk-xxx npx playwright test tests/vision/
 */

import { test, expect } from '@playwright/test';
import { analyzeUI, PROMPTS, runFullUIAudit } from './deepseek-vision.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// ถ้าไม่มี API Key (DeepSeek หรือ Gemini) ให้ skip
const hasApiKey = process.env.DEEPSEEK_API_KEY || process.env.GEMINI_API_KEY;
const testWithKey = hasApiKey ? test : test.skip;

test.describe('PeteMarket Vision Tests', () => {
  testWithKey('@visual @smoke หน้า Login - ตรวจสอบ UI elements', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');
    
    const screenshot = await page.screenshot({ fullPage: true });
    const base64 = screenshot.toString('base64');
    
    const result = await analyzeUI(base64, PROMPTS.UI_ELEMENTS);
    expect(result.analysis).toBeTruthy();
    
    test.info().annotations.push({
      type: 'vision-analysis',
      description: result.analysis,
    });
    
    console.log('🔍 Login Page Analysis:', result.analysis);
  });

  testWithKey('@visual @smoke หน้า Dashboard - วิเคราะห์ Layout', async ({ page }) => {
    await page.goto(`${BASE_URL}/home`);
    await page.waitForLoadState('networkidle');
    
    const screenshot = await page.screenshot({ fullPage: true });
    const base64 = screenshot.toString('base64');
    
    const result = await analyzeUI(base64, PROMPTS.LAYOUT_ANALYSIS);
    expect(result.analysis).toBeTruthy();
    
    console.log('🔍 Dashboard Layout:', result.analysis);
  });

  testWithKey('@visual @smoke หน้า Pricing - ตรวจสอบ Error', async ({ page }) => {
    await page.goto(`${BASE_URL}/pricing`);
    await page.waitForLoadState('networkidle');
    
    const screenshot = await page.screenshot({ fullPage: true });
    const base64 = screenshot.toString('base64');
    
    const result = await analyzeUI(base64, PROMPTS.ERROR_DETECTION);
    expect(result.analysis).toBeTruthy();
    
    console.log('🔍 Pricing Page Errors:', result.analysis);
  });

  testWithKey('@visual @full UI Audit ครบทุกด้าน', async ({ page }) => {
    await page.goto(`${BASE_URL}/home`);
    await page.waitForLoadState('networkidle');
    
    const screenshot = await page.screenshot({ fullPage: true });
    const base64 = screenshot.toString('base64');
    
    const results = await runFullUIAudit(base64);
    
    // ตรวจสอบว่าทุกอันผ่าน
    for (const [name, result] of Object.entries(results)) {
      expect(result.error).toBeUndefined();
      expect(result.analysis).toBeTruthy();
      console.log(`\n📋 ${name}:`);
      console.log(result.analysis);
    }
  });
});
