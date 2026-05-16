
import re

with open("/home/openhands/erp-core/erp-core/packages/ai-orchestrator/src/agent-loop-v2.ts", "r") as f:
    content = f.read()

# 1. แก้ buildToolDefs — เพิ่ม filter ตาม task type
old_build = """    for (const t of allTools) {
      tools.push({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema || {},
        },
      });
    }"""

new_build = """    // ─── Filter tools based on task type ──────
    const text = (task.title + " " + task.description).toLowerCase();

    for (const t of allTools) {
      // Filter by task type
      if (task.type === "browser" && !t.name.startsWith("browser_") && t.name !== "analyze_image") continue;
      if (task.type === "api" && !t.name.startsWith("http_") && !t.name.startsWith("api_") && !t.name.startsWith("etsy_")) continue;
      if (task.type === "file" && !t.name.startsWith("file_") && !t.name.startsWith("code_") && t.name !== "write_file" && t.name !== "execute_command" && t.name !== "http_request" && t.name !== "browser_navigate" && t.name !== "browser_read") continue;
      if (task.type === "llm" && !t.name.startsWith("llm_") && !t.name.startsWith("analyze_")) continue;
      if (task.type === "system" && !t.name.startsWith("system_") && !t.name.startsWith("task_")) continue;
      if (task.type === "chat" && !t.name.startsWith("chat_") && !t.name.startsWith("revive_")) continue;
      tools.push({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema || {},
        },
      });
    }"""

if old_build in content:
    content = content.replace(old_build, new_build)
    print("1. buildToolDefs filter updated")
else:
    print("1. ERROR: Could not find buildToolDefs loop")

# 2. แก้ agentPrompts["file"]
old_prompt = 'file: "You are a file management agent. Use file tools to read, write, search, and organize files. Focus on correct file paths and data integrity."'
new_prompt = 'file: `You are a full-stack development agent. You have access to the following tools:\n- write_file: Create or edit files on the server (use for creating React components, pages, configs)\n- execute_command: Run bash commands (use for npm, git, build, deploy, ls, mkdir)\n- http_request: Send HTTP requests (use for checking if servers are running)\n- browser_navigate: Navigate to a URL in the browser\n- browser_read: Read the content of a web page\n- browser_screenshot: Take a screenshot of the current page\n- browser_click: Click on an element\n- browser_fill: Fill a form field\n\nWORKFLOW for creating a frontend module:\n1. First use execute_command to run "ls" to see the project structure\n2. Use execute_command to create directories if needed (mkdir -p)\n3. Use write_file to create component files (React/TypeScript)\n4. Use execute_command to run "npm install" if dependencies are needed\n5. Use execute_command to run "npm run build" to build\n6. Use http_request to verify the server is running\n7. Use browser_navigate to verify the result in the browser\n\nIMPORTANT: You MUST actually create files and run commands, not just list directories. Focus on creating working code.`'

if old_prompt in content:
    content = content.replace(old_prompt, new_prompt)
    print("2. agentPrompts[file] updated")
else:
    print("2. ERROR: Could not find old prompt")

# 3. แก้ jarvis-prompt.ts
with open("/home/openhands/erp-core/erp-core/packages/ai-orchestrator/src/jarvis-prompt.ts", "r") as f:
    jarvis = f.read()

old_jarvis = 'export const JARVIS_SYSTEM_PROMPT = `คุณคือ Jarvis — AI Orchestrator อัจฉริยะ\n\n## ความสามารถ\n- บริหาร Task Queue (SQLite-based)\n- ค้นหาความรู้จาก SiYuan Knowledge Base\n- เรียกใช้ Tools 56 ตัว (ERP, Task, SiYuan, Browser, Code)\n- ทำงานอัตโนมัติโดยไม่ต้องรอคำสั่ง\n- ขอ Approval เฉพาะงานสำคัญ\n\n## กฎการทำงาน\n1. ได้รับ task → ค้น SiYuan ก่อนเสมอ\n2. วางแผนเอง → execute → บันทึกผล\n3. ถ้าติด/ไม่แน่ใจ → สร้าง approval task\n4. รายงานสรุปเมื่อ pipeline จบ\n\n## Tools ที่มี\n- task_* : จัดการ Task Queue\n- siyuan_* : ค้นหา/สร้าง/แก้ไขความรู้\n- erp_* : ระบบ ERP\n- browser_* : ควบคุม browser\n- code_* : จัดการ code\n\n## การตอบกลับ\n- ตอบเป็นภาษาเดียวกับผู้ใช้ (ไทย/อังกฤษ)\n- กระชับ ได้ใจความ\n- ถ้าทำอะไรสำเร็จ → สรุปผลลัพธ์\n- ถ้าติดปัญหา → แจ้งและขอคำแนะนำ`;'

new_jarvis = 'export const JARVIS_SYSTEM_PROMPT = `คุณคือ Jarvis — AI Orchestrator อัจฉริยะ\n\n## ความสามารถ\n- บริหาร Task Queue (SQLite-based)\n- ค้นหาความรู้จาก SiYuan Knowledge Base\n- เรียกใช้ Tools 62 ตัว (ERP, Task, SiYuan, Browser, File, HTTP)\n- ทำงานอัตโนมัติโดยไม่ต้องรอคำสั่ง\n- ขอ Approval เฉพาะงานสำคัญ\n\n## กฎการทำงาน\n1. ได้รับ task → ตรวจสอบ tools ที่มีให้ใช้ก่อน (tool names ขึ้นต้นด้วย category)\n2. วางแผน → execute → ตรวจสอบผลลัพธ์ → บันทึกผล\n3. ถ้าติด/ไม่แน่ใจ → สร้าง approval task\n4. รายงานสรุปเมื่อ pipeline จบ\n\n## Tools ที่มี (ชื่อ tool = category_function)\n- task_manager_* : จัดการ Task Queue (list, create, update, delete projects/tasks)\n- siyuan_* : ค้นหา/สร้าง/แก้ไขความรู้ใน SiYuan\n- erp_* : ระบบ ERP (products, orders, inventory, invoices)\n- browser_* : ควบคุม browser (navigate, click, fill, screenshot, read, evaluate)\n- write_file : เขียนไฟล์บน server (ใช้สร้าง/แก้ไขไฟล์)\n- execute_command : รัน bash command (ใช้รัน npm, git, build, deploy)\n- http_request : ส่ง HTTP request (ใช้เรียก API, fetch data)\n- memory_* : จัดการ session และ state\n- agency_* : ส่งงานต่อให้ agent อื่น\n- orchestrator_* : ตรวจสอบสุขภาพระบบ\n- etsy_mock_* : ทดสอบ Etsy API\n\n## ตัวอย่าง Workflow สําหรับสร้าง Frontend Module\n1. ใช้ execute_command รัน "ls" ดูโครงสร้างโปรเจคที่มีอยู่\n2. ใช้ execute_command รัน "npm create" หรือ "npx create" ถ้าต้องสร้างใหม่\n3. ใช้ write_file เขียนไฟล์ component, page, route\n4. ใช้ execute_command รัน "npm run build" เพื่อ build\n5. ใช้ http_request ตรวจสอบว่า server รับ request ได้\n6. ใช้ browser_navigate ตรวจสอบผลลัพธ์ใน browser\n\n## การตอบกลับ\n- ตอบเป็นภาษาเดียวกับผู้ใช้ (ไทย/อังกฤษ)\n- กระชับ ได้ใจความ\n- ถ้าทําอะไรสําเร็จ → สรุปผลลัพธ์\n- ถ้าติดปัญหา → แจ้งและขอคําแนะนํา`;'

if old_jarvis in jarvis:
    jarvis = jarvis.replace(old_jarvis, new_jarvis)
    with open("/home/openhands/erp-core/erp-core/packages/ai-orchestrator/src/jarvis-prompt.ts", "w") as f:
        f.write(jarvis)
    print("3. jarvis-prompt.ts updated")
else:
    print("3. ERROR: Could not find old jarvis prompt")
    # Debug: find the line
    for i, line in enumerate(jarvis.split("\n")):
        if "JARVIS_SYSTEM_PROMPT" in line:
            print(f"  Found at line {i+1}: {line[:80]}...")

# 4. แก้ _popTaskFromTM type cast
old_type = 'type: taskType,'
new_type = 'type: taskType as TaskType,'
if old_type in content:
    content = content.replace(old_type, new_type)
    print("4. TaskType cast fixed")
else:
    print("4. ERROR: Could not find taskType cast")

# 5. แก้ import TaskType
old_import = 'import { TaskQueue, type Task } from "./task-queue.js";'
new_import = 'import { TaskQueue, type Task, type TaskType } from "./task-queue.js";'
if old_import in content:
    content = content.replace(old_import, new_import)
    print("5. TaskType import added")
else:
    print("5. ERROR: Could not find TaskQueue import")

with open("/home/openhands/erp-core/erp-core/packages/ai-orchestrator/src/agent-loop-v2.ts", "w") as f:
    f.write(content)
print("6. agent-loop-v2.ts saved")
