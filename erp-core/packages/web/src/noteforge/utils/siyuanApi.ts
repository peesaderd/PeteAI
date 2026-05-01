// ============================================================
// SiYuan API Client — เชื่อม NoteForge กับ SiYuan Knowledge Base
// ============================================================

const SIYUAN_URL = "http://89.167.82.205:54511";
const SIYUAN_TOKEN = "9w4oqxucqvq1o8sd";
const SIYUAN_NOTEBOOK = "20260430171620-3x8gib1"; // "ERP Integration"

export interface SiYuanDoc {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  links: string[];
}

async function siyuanCall(method: string, data: Record<string, any> = {}): Promise<any> {
  const res = await fetch(`${SIYUAN_URL}${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${SIYUAN_TOKEN}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SiYuan API error (${res.status}): ${err}`);
  }
  const json = await res.json();
  if (json.code !== 0) throw new Error(`SiYuan error: ${json.msg || JSON.stringify(json)}`);
  return json.data;
}

// ดึง docs ทั้งหมดจาก notebook
export async function fetchAllDocs(): Promise<SiYuanDoc[]> {
  try {
    // ใช้ sql query ดึง blocks ที่เป็น document
    const data = await siyuanCall("/api/query/sql", {
      stmt: `SELECT * FROM blocks WHERE notebook_id =  AND type = d ORDER BY updated DESC`,
    });
    if (!Array.isArray(data)) return [];

    const docs: SiYuanDoc[] = [];
    for (const row of data) {
      const doc = await fetchDocContent(row.id);
      if (doc) docs.push(doc);
    }
    return docs;
  } catch (e) {
    console.error("fetchAllDocs error:", e);
    return [];
  }
}

// ดึง doc เดียวพร้อม content
export async function fetchDocContent(docId: string): Promise<SiYuanDoc | null> {
  try {
    const data = await siyuanCall("/api/attr/getBlockAttrs", { id: docId });
    const content = await getDocContent(docId);
    return {
      id: docId,
      title: data?.title || docId,
      content: content,
      tags: data?.tags ? data.tags.split(",").filter(Boolean) : [],
      createdAt: data?.created ? parseInt(data.created) : Date.now(),
      updatedAt: data?.updated ? parseInt(data.updated) : Date.now(),
      links: extractSiYuanLinks(content),
    };
  } catch (e) {
    return null;
  }
}

async function getDocContent(docId: string): Promise<string> {
  try {
    const data = await siyuanCall("/api/export/exportMdContent", { id: docId });
    if (data?.content) return data.content;
    // fallback: get child blocks
    const blocks = await siyuanCall("/api/block/getBlockTree", { id: docId });
    if (blocks?.length) {
      return blocks.map((b: any) => b.content || "").join("\n\n");
    }
    return "";
  } catch (e) {
    return "";
  }
}

function extractSiYuanLinks(content: string): string[] {
  const links: string[] = [];
  const refRegex = /\(\(\(([^)]+)\)\)\)/g;
  let match;
  while ((match = refRegex.exec(content)) !== null) {
    links.push(match[1].trim());
  }
  return links;
}

// สร้าง doc ใหม่ใน SiYuan
export async function createSiYuanDoc(title: string, content: string = "", tags: string[] = []): Promise<string | null> {
  try {
    const data = await siyuanCall("/api/filetree/createDocWithMd", {
      notebook: SIYUAN_NOTEBOOK,
      path: `/${title}.md`,
      markdown: content,
    });
    const docId = data?.id || null;
    if (docId && tags.length > 0) {
      await siyuanCall("/api/attr/setBlockAttrs", {
        id: docId,
        attrs: { tags: tags.join(","), title },
      });
    }
    return docId;
  } catch (e) {
    console.error("createSiYuanDoc error:", e);
    return null;
  }
}

// อัปเดต doc ใน SiYuan
export async function updateSiYuanDoc(docId: string, content: string, title?: string, tags?: string[]): Promise<boolean> {
  try {
    await siyuanCall("/api/filetree/updateDoc", { id: docId, markdown: content });
    const attrs: Record<string, string> = {};
    if (title) attrs.title = title;
    if (tags) attrs.tags = tags.join(",");
    if (Object.keys(attrs).length > 0) {
      await siyuanCall("/api/attr/setBlockAttrs", { id: docId, attrs });
    }
    return true;
  } catch (e) {
    console.error("updateSiYuanDoc error:", e);
    return false;
  }
}

// ลบ doc
export async function deleteSiYuanDoc(docId: string): Promise<boolean> {
  try {
    await siyuanCall("/api/filetree/removeDocument", { id: docId });
    return true;
  } catch (e) {
    console.error("deleteSiYuanDoc error:", e);
    return false;
  }
}
