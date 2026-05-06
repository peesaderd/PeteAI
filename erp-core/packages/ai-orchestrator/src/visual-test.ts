// ============================================================
// Visual Test — Etsy Product Image Analysis
//
// สร้างรูปตัวอย่างสินค้า (via Python Pillow) →
// วิเคราะห์ด้วย Gemini Vision → ตรวจสอบ Etsy compliance →
// รายงานผล
// ============================================================

import { VisionAnalysis, VisionAnalysisResult } from "./vision-analysis";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Etsy Image Requirements ──────────────────────────────

interface EtsyImageRequirement {
  key: string;
  label: string;
  check: (analysis: VisionAnalysisResult) => { pass: boolean; detail: string };
}

const ETSY_REQUIREMENTS: EtsyImageRequirement[] = [
  {
    key: "background",
    label: "พื้นหลังเรียบ/ขาว",
    check: (a) => {
      const bg = (a.composition?.background || "").toLowerCase();
      const pass = /white|plain|clean|neutral|solid/i.test(bg);
      return { pass, detail: pass ? `พื้นหลัง: ${a.composition?.background}` : `ควรใช้พื้นหลังเรียบ ปัจจุบัน: ${bg}` };
    },
  },
  {
    key: "subject_clear",
    label: "สินค้าชัดเจน เป็นสัดส่วน",
    check: (a) => {
      const desc = (a.description || "").toLowerCase();
      const subj = (a.composition?.subject || "").toLowerCase();
      const pass = desc.length > 20 && subj.length > 5;
      return { pass, detail: pass ? `สินค้า: ${a.composition?.subject}` : "รายละเอียดสินค้าไม่ชัดเจน" };
    },
  },
  {
    key: "lighting",
    label: "แสงสว่างเพียงพอ",
    check: (a) => {
      const q = (a.lighting?.quality || "").toLowerCase();
      const pass = /bright|well-lit|soft|diffuse|good|professional/i.test(q);
      return { pass, detail: pass ? `แสง: ${a.lighting?.quality} (${a.lighting?.type})` : `แสงไม่เหมาะสม: ${q}` };
    },
  },
  {
    key: "framing",
    label: "จัดวางเหมาะสม ไม่ถูกตัด",
    check: (a) => {
      const f = (a.composition?.framing || "").toLowerCase();
      const pass = /center|close|full|tight|well-framed|proper/i.test(f) && !/cropped|cut off|truncated/i.test(f);
      return { pass, detail: pass ? `เฟรม: ${a.composition?.framing}` : `การจัดวางไม่เหมาะสม: ${f}` };
    },
  },
  {
    key: "color_vibrant",
    label: "สีสันสดใส ดึงดูด",
    check: (a) => {
      const mood = (a.colorAnalysis?.mood || "").toLowerCase();
      const pass = /vibrant|bright|warm|rich|colorful|cheerful|bold/i.test(mood);
      return { pass, detail: pass ? `อารมณ์สี: ${a.colorAnalysis?.mood}` : `สีอาจดูหม่น: ${mood}` };
    },
  },
];

// ─── Generate Test Images via Python Pillow ───────────────

function generateImages(outputDir: string): { good: string; bad: string } {
  const scriptPath = path.join(outputDir, "generate_test_images.py");
  const script = `
from PIL import Image, ImageDraw
import random, sys

output_dir = sys.argv[1]

# --- Good Image ---
img = Image.new('RGB', (600, 400), '#f5f5f0')
draw = ImageDraw.Draw(img)

# Mug body
draw.rounded_rectangle([220, 180, 380, 320], fill='#d4b8a0', radius=8)
# Mug rim
draw.rounded_rectangle([218, 170, 382, 190], fill='#c4a88c', radius=6)
# Handle
draw.arc([370, 200, 430, 280], -30, 30, fill='#d4b8a0', width=18)
# Decorative pattern
draw.ellipse([270, 210, 330, 270], fill='#8ab4a0')
draw.ellipse([282, 222, 318, 258], fill='#7aa490')
# Shadow under mug
draw.ellipse([240, 315, 360, 335], fill='#e0d8d0')

img.save(f"{output_dir}/product-good.png")

# --- Bad Image ---
img2 = Image.new('RGB', (600, 400), '#2a1a0a')
draw2 = ImageDraw.Draw(img2)

# Small product off-center
draw2.ellipse([110, 250, 190, 310], fill='#5a4a3a')
# Distracting elements
draw2.rounded_rectangle([400, 50, 550, 170], fill='#4a3a2a', radius=4)
draw2.rounded_rectangle([420, 70, 530, 150], fill='#3a2a1a', radius=4)
# Noise
for _ in range(100):
    x = random.randint(0, 599)
    y = random.randint(0, 399)
    c = random.randint(180, 255)
    draw2.point((x, y), fill=(c, c, c))

img2.save(f"{output_dir}/product-bad.png")
print("Images generated")
`;
  fs.writeFileSync(scriptPath, script);
  execSync(`python3 "${scriptPath}" "${outputDir}"`, { stdio: "pipe" });
  fs.unlinkSync(scriptPath);
  return {
    good: path.join(outputDir, "product-good.png"),
    bad: path.join(outputDir, "product-bad.png"),
  };
}

// ─── Main ─────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("  Etsy Visual Test — Product Image Analysis");
  console.log("=".repeat(60));

  // 1. Generate sample images
  console.log("\n📸 Generating sample product images...");
  const outputDir = path.join(__dirname, "..", "test-output");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const { good: goodPath, bad: badPath } = generateImages(outputDir);
  console.log(`   ✅ ${goodPath}`);
  console.log(`   ✅ ${badPath}`);

  // 2. Analyze with Gemini
  console.log("\n🔍 Analyzing with Gemini 2.5 Flash...");
  const vision = new VisionAnalysis();

  const goodBase64 = fs.readFileSync(goodPath).toString("base64");
  const badBase64 = fs.readFileSync(badPath).toString("base64");

  console.log("\n   ── Good Image ──");
  const goodResult = await vision.analyze({
    imageBase64: goodBase64,
    mimeType: "image/png",
    question: "Analyze this product image for Etsy listing. Is the product clearly visible? Is the background clean?",
  });
  console.log(`   ${goodResult.success ? "✅" : "❌"} ${goodResult.description.slice(0, 100)}...`);
  if (goodResult.composition) console.log(`   Subject: ${goodResult.composition.subject}`);
  if (goodResult.colorAnalysis) console.log(`   Mood: ${goodResult.colorAnalysis.mood}`);
  if (goodResult.lighting) console.log(`   Lighting: ${goodResult.lighting.quality} (${goodResult.lighting.type})`);

  console.log("\n   ── Bad Image ──");
  const badResult = await vision.analyze({
    imageBase64: badBase64,
    mimeType: "image/png",
    question: "Analyze this product image for Etsy listing. What are the issues?",
  });
  console.log(`   ${badResult.success ? "✅" : "❌"} ${badResult.description.slice(0, 100)}...`);
  if (badResult.composition) console.log(`   Subject: ${badResult.composition.subject}`);
  if (badResult.colorAnalysis) console.log(`   Mood: ${badResult.colorAnalysis.mood}`);
  if (badResult.lighting) console.log(`   Lighting: ${badResult.lighting.quality} (${badResult.lighting.type})`);

  // 3. Check Etsy compliance
  console.log("\n📋 Etsy Compliance Check:");
  console.log("   " + "-".repeat(50));

  for (const req of ETSY_REQUIREMENTS) {
    const result = req.check(goodResult);
    console.log(`   ${result.pass ? "✅" : "❌"} ${req.label}`);
    console.log(`      ${result.detail}`);
  }

  console.log("\n   " + "-".repeat(50));
  console.log("   ❌ Image (for comparison):");
  for (const req of ETSY_REQUIREMENTS) {
    const result = req.check(badResult);
    console.log(`   ${result.pass ? "✅" : "❌"} ${req.label}`);
    console.log(`      ${result.detail}`);
  }

  // 4. Summary
  const goodPass = ETSY_REQUIREMENTS.filter((r) => r.check(goodResult).pass).length;
  const badPass = ETSY_REQUIREMENTS.filter((r) => r.check(badResult).pass).length;

  console.log("\n" + "=".repeat(60));
  console.log("  SUMMARY");
  console.log("=".repeat(60));
  console.log(`  ✅ Good image:  ${goodPass}/${ETSY_REQUIREMENTS.length} requirements met`);
  console.log(`  ❌ Bad image:   ${badPass}/${ETSY_REQUIREMENTS.length} requirements met`);
  console.log("=".repeat(60));
}

main().catch(console.error);
