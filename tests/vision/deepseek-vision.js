/**
 * DeepSeek Vision API Client สำหรับ UI Testing
 * ใช้กับ PeteMarket / PeteAI ERP Core
 * 
 * โมเดลที่มี:
 * - deepseek-v4-flash (เร็ว, เหมาะกับ CI)
 * - deepseek-v4-pro (แม่นยำ, spatial reasoning)
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const BASE_URL = 'https://api.deepseek.com/v1';

if (!DEEPSEEK_API_KEY) {
  console.warn('⚠️ DEEPSEEK_API_KEY not set — vision tests will be skipped');
}

/**
 * วิเคราะห์ UI จาก screenshot
 * @param {string} imageBase64 - Base64 encoded screenshot
 * @param {string} prompt - คำถามเกี่ยวกับ UI
 * @param {string} model - 'deepseek-v4-flash' | 'deepseek-v4-pro'
 */
export async function analyzeUI(imageBase64, prompt, model = 'deepseek-v4-flash') {
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${imageBase64}` }
            }
          ]
        }
      ],
      max_tokens: 1024,
      temperature: 0.1,  // ต่ำเพื่อผลลัพธ์ consistent
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DeepSeek API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return {
    analysis: data.choices[0].message.content,
    model: data.model,
    usage: data.usage,
  };
}

/**
 * Prompt Templates สำหรับ UI Testing
 */
export const PROMPTS = {
  // 1. UI Element Detection
  UI_ELEMENTS: `List all interactive elements on this page with their:
- Type (button, input, link, menu, etc.)
- Label/text content
- Approximate position (top/left region)
- Is it clickable? (yes/no)

Format as JSON array.`,

  // 2. Layout Analysis
  LAYOUT_ANALYSIS: `Analyze this page layout:
1. Is the layout consistent and properly aligned?
2. Are there any overlapping elements?
3. Is the spacing between sections balanced?
4. Are there any responsive issues visible?
5. List any UI/UX problems you spot.

Be specific about positions and elements.`,

  // 3. Error Detection
  ERROR_DETECTION: `Does this page show any:
1. Error messages or alerts?
2. 404 or 500 errors?
3. Form validation errors?
4. Loading states that are stuck?
5. Missing content or broken images?

If no errors, say "No errors detected."`,

  // 4. Visual Regression
  VISUAL_REGRESSION: `Compare this UI screenshot against expected design:
1. Are all elements in their correct positions?
2. Are colors and styling consistent?
3. Is text properly readable (no overflow, truncation)?
4. Are icons and images loading correctly?
5. List any visual differences or anomalies.`,

  // 5. Accessibility Check
  ACCESSIBILITY: `Check this page for accessibility issues:
1. Are color contrasts sufficient?
2. Are text sizes readable?
3. Are interactive elements clearly identifiable?
4. Is there sufficient spacing between touch targets?
5. List any accessibility concerns.`,
};

/**
 * รัน vision test ครบทุกด้าน
 */
export async function runFullUIAudit(imageBase64) {
  const results = {};
  
  for (const [name, prompt] of Object.entries(PROMPTS)) {
    console.log(`\n🔍 Running ${name}...`);
    try {
      const result = await analyzeUI(imageBase64, prompt, 'deepseek-v4-flash');
      results[name] = {
        analysis: result.analysis,
        model: result.model,
      };
      console.log(`✅ ${name} complete (${result.usage?.total_tokens || '?'} tokens)`);
    } catch (err) {
      results[name] = { error: err.message };
      console.error(`❌ ${name} failed: ${err.message}`);
    }
  }
  
  return results;
}
