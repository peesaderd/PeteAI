// ============================================================
// Etsy API Client v3 — OAuth + Listing Management
// ============================================================
// ใช้ Etsy Open API v3 โดยตรง (ไม่ต้องใช้ SDK)
// Reference: https://developers.etsy.com/documentation/reference
// ============================================================

import crypto from "crypto";

const ETSY_AUTH_URL = "https://www.etsy.com/oauth/connect";
const ETSY_TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";
const ETSY_API_BASE = "https://openapi.etsy.com/v3";

// ─── Types ─────────────────────────────────────────────────

export interface EtsyApiConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string[];
}

export interface EtsyToken {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface EtsyUser {
  user_id: number;
  login_name: string;
  primary_email: string;
  create_date: number;
}

export interface EtsyShop {
  shop_id: number;
  shop_name: string;
  user_id: number;
  listing_active_count: number;
  url: string;
}

export interface EtsyListing {
  listing_id: number;
  title: string;
  description: string;
  price: number;
  quantity: number;
  state: "draft" | "active" | "inactive" | "sold_out" | "expired";
  url: string;
  images: EtsyListingImage[];
  tags: string[];
  materials: string[];
  taxonomy_id: number;
  who_made?: string;
  when_made?: string;
  type: "physical" | "download" | "both";
}

export interface EtsyListingImage {
  listing_image_id: number;
  listing_id: number;
  url_fullxfull: string;
  url_75x75: string;
  rank: number;
}

export interface CreateDraftListingParams {
  title: string;
  description: string;
  price: number;
  quantity: number;
  taxonomy_id: number;
  who_made: "i_did" | "someone_else" | "collective";
  when_made: string;
  tags?: string[];
  materials?: string[];
  shipping_profile_id?: number;
  shop_section_id?: number;
  type?: "physical" | "download" | "both";
  is_supply?: boolean;
  is_customizable?: boolean;
  should_auto_renew?: boolean;
  is_taxable?: boolean;
}

export interface UploadImageParams {
  listingId: number;
  imageBase64: string;
  rank?: number;
  altText?: string;
}

export interface PublishListingParams {
  listingId: number;
  shopId: number;
}

// ─── Error ─────────────────────────────────────────────────

export class EtsyApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public body?: string,
  ) {
    super(message);
    this.name = "EtsyApiError";
  }
}

// ─── Client ────────────────────────────────────────────────

export class EtsyApiClient {
  private config: EtsyApiConfig;
  private token: EtsyToken | null = null;

  constructor(config: EtsyApiConfig) {
    this.config = config;
  }

  // ─── OAuth Flow ─────────────────────────────────────────

  /** ขั้นตอนที่ 1: สร้าง PKCE และ Authorization URL */
  generateAuthUrl(): { url: string; codeVerifier: string; state: string } {
    const { verifier, challenge, state } = generatePKCE();

    const params = new URLSearchParams({
      response_type: "code",
      redirect_uri: this.config.redirectUri,
      scope: (this.config.scopes ?? [
        "listings_r",
        "listings_w",
        "shops_r",
        "transactions_r",
        "receipts_r",
        "payments_r",
        "reviews_r",
        "profile_r",
        "email_r",
      ]).join(" "),
      client_id: this.config.clientId,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });

    return {
      url: `${ETSY_AUTH_URL}?${params.toString()}`,
      codeVerifier: verifier,
      state,
    };
  }

  /** ขั้นตอนที่ 2: แลก code → access token */
  async exchangeCode(code: string, codeVerifier: string): Promise<EtsyToken> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
      code,
      code_verifier: codeVerifier,
    });

    const res = await fetch(ETSY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new EtsyApiError(
        `Token exchange failed: ${await res.text()}`,
        res.status,
      );
    }

    this.token = await res.json();
    return this.token!;
  }

  /** ขั้นตอนที่ 3: Refresh token */
  async refreshToken(): Promise<EtsyToken> {
    if (!this.token?.refresh_token) {
      throw new EtsyApiError("No refresh token available");
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: this.token.refresh_token,
    });

    const res = await fetch(ETSY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new EtsyApiError(
        `Token refresh failed: ${await res.text()}`,
        res.status,
      );
    }

    this.token = await res.json();
    return this.token!;
  }

  /** ตั้งค่า token ที่มีอยู่แล้ว (เช่น จาก database) */
  setToken(token: EtsyToken): void {
    this.token = token;
  }

  /** ตรวจสอบว่ามี token หรือไม่ */
  isAuthenticated(): boolean {
    return this.token !== null;
  }

  // ─── User / Shop ────────────────────────────────────────

  /** ดึงข้อมูลผู้ใช้ปัจจุบัน */
  async getMe(): Promise<EtsyUser> {
    return this.apiCall<EtsyUser>("GET", "/application/users/me");
  }

  /** ดึง Shop ID จาก User ID */
  async getShopByOwnerUserId(userId: number): Promise<EtsyShop[]> {
    const data = await this.apiCall<{ results: EtsyShop[] }>(
      "GET",
      `/application/users/${userId}/shops`,
    );
    return data.results ?? [];
  }

  /** ค้นหาร้านค้าจากชื่อ */
  async findShops(shopName: string): Promise<EtsyShop[]> {
    const data = await this.apiCall<{ results: EtsyShop[] }>(
      "GET",
      `/application/shops?shop_name=${encodeURIComponent(shopName)}`,
    );
    return data.results ?? [];
  }

  /** ดึงข้อมูลร้านค้า */
  async getShop(shopId: number): Promise<EtsyShop> {
    return this.apiCall<EtsyShop>("GET", `/application/shops/${shopId}`);
  }

  // ─── Listing Management ─────────────────────────────────

  /** สร้าง Draft Listing */
  async createDraftListing(
    shopId: number,
    params: CreateDraftListingParams,
  ): Promise<EtsyListing> {
    const body = new URLSearchParams();
    body.append("title", params.title);
    body.append("description", params.description);
    body.append("price", params.price.toString());
    body.append("quantity", params.quantity.toString());
    body.append("taxonomy_id", params.taxonomy_id.toString());
    body.append("who_made", params.who_made);
    body.append("when_made", params.when_made);
    body.append("type", params.type ?? "physical");

    if (params.tags?.length) {
      body.append("tags", params.tags.join(","));
    }
    if (params.materials?.length) {
      for (const m of params.materials) body.append("materials", m);
    }
    if (params.shipping_profile_id) {
      body.append("shipping_profile_id", params.shipping_profile_id.toString());
    }
    if (params.shop_section_id) {
      body.append("shop_section_id", params.shop_section_id.toString());
    }
    if (params.is_supply !== undefined) {
      body.append("is_supply", params.is_supply.toString());
    }
    if (params.is_customizable !== undefined) {
      body.append("is_customizable", params.is_customizable.toString());
    }
    if (params.should_auto_renew !== undefined) {
      body.append("should_auto_renew", params.should_auto_renew.toString());
    }
    if (params.is_taxable !== undefined) {
      body.append("is_taxable", params.is_taxable.toString());
    }

    return this.apiCall<EtsyListing>(
      "POST",
      `/application/shops/${shopId}/listings`,
      body.toString(),
      "application/x-www-form-urlencoded",
    );
  }

  /** อัปโหลดรูปภาพ (base64 → multipart/form-data) */
  async uploadListingImage(
    shopId: number,
    params: UploadImageParams,
  ): Promise<EtsyListingImage> {
    // แปลง base64 เป็น Blob
    const byteString = atob(params.imageBase64);
    const ab = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      ab[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: "image/png" });

    const formData = new FormData();
    formData.append("image", blob, "listing-image.png");
    if (params.rank !== undefined) {
      formData.append("rank", params.rank.toString());
    }
    if (params.altText) {
      formData.append("alt_text", params.altText);
    }

    return this.apiCall<EtsyListingImage>(
      "POST",
      `/application/shops/${shopId}/listings/${params.listingId}/images`,
      formData,
    );
  }

  /** เผยแพร่ Draft → Active */
  async publishListing(
    shopId: number,
    listingId: number,
  ): Promise<EtsyListing> {
    const body = new URLSearchParams();
    body.append("state", "active");

    return this.apiCall<EtsyListing>(
      "PATCH",
      `/application/shops/${shopId}/listings/${listingId}`,
      body.toString(),
      "application/x-www-form-urlencoded",
    );
  }

  /** อัปเดต listing (แก้ไขรายละเอียด) */
  async updateListing(
    shopId: number,
    listingId: number,
    updates: Partial<CreateDraftListingParams & { state: string }>,
  ): Promise<EtsyListing> {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        if (key === "tags") {
          body.append("tags", value.join(","));
        } else {
          for (const item of value) body.append(key, item);
        }
      } else {
        body.append(key, value.toString());
      }
    }

    return this.apiCall<EtsyListing>(
      "PATCH",
      `/application/shops/${shopId}/listings/${listingId}`,
      body.toString(),
      "application/x-www-form-urlencoded",
    );
  }

  /** ดึงข้อมูล listing */
  async getListing(listingId: number): Promise<EtsyListing> {
    return this.apiCall<EtsyListing>(
      "GET",
      `/application/listings/${listingId}`,
    );
  }

  /** ดึงรายการ listings ทั้งหมดของร้าน */
  async getListingsByShop(shopId: number): Promise<EtsyListing[]> {
    const data = await this.apiCall<{ results: EtsyListing[] }>(
      "GET",
      `/application/shops/${shopId}/listings?limit=100`,
    );
    return data.results ?? [];
  }

  // ─── Internal ───────────────────────────────────────────

  private async ensureValidToken(): Promise<string> {
    if (!this.token?.access_token) {
      throw new EtsyApiError("Not authenticated. Call exchangeCode() first.");
    }
    return this.token.access_token;
  }

  private async apiCall<T>(
    method: string,
    path: string,
    body?: BodyInit | null,
    contentType?: string,
  ): Promise<T> {
    const token = await this.ensureValidToken();
    const url = `${ETSY_API_BASE}${path}`;
    const headers: Record<string, string> = {
      "x-api-key": this.config.clientId,
      Authorization: `Bearer ${token}`,
    };

    if (contentType) {
      headers["Content-Type"] = contentType;
    } else if (body && typeof body === "string") {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
    // FormData — อย่า set Content-Type ปล่อยให้ browser/fetch ตั้งค่า boundary เอง

    const res = await fetch(url, {
      method,
      headers,
      body: body ?? undefined,
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new EtsyApiError(
        `Etsy API error (${res.status}): ${errBody}`,
        res.status,
        errBody,
      );
    }

    // DELETE หรือ response ไม่มี content
    if (res.status === 204) return {} as T;

    return res.json();
  }

}

// ─── Helper: สร้าง PKCE โดยใช้ Node crypto ─────────────────

function generatePKCE() {
  const verifier = crypto.randomBytes(32)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9._~-]/g, "");

  const challenge = crypto.createHash("sha256")
    .update(verifier)
    .digest("base64url");

  const state = crypto.randomBytes(16).toString("hex");

  return { verifier, challenge, state };
}

// ─── Taxonomy IDs ที่ใช้งานบ่อย ────────────────────────────
// ดูเพิ่มเติม: https://developers.etsy.com/documentation/reference#operation/getBuyerTaxonomyNodes
export const ETSY_TAXONOMIES = {
  // Art & Collectibles
  PAINTING: 1,
  DRAWING: 3,
  PHOTOGRAPHY: 5,
  DIGITAL_ART: 5520,
  PRINT: 8,
  SCULPTURE: 11,
  MIXED_MEDIA: 14,
  // Home & Living
  HOME_DECOR: 25,
  KITCHEN_DINING: 30,
  BATHROOM: 34,
  BEDROOM: 36,
  // Jewelry & Accessories
  NECKLACE: 41,
  BRACELET: 44,
  EARRINGS: 47,
  RING: 50,
  // Clothing & Shoes
  CLOTHING: 55,
  SHOES: 60,
  ACCESSORIES: 64,
  // Craft Supplies & Tools
  CRAFT_SUPPLIES: 65,
  TOOLS: 69,
  // Vintage
  VINTAGE: 72,
  // Weddings
  WEDDING_DECOR: 73,
  WEDDING_ACCESSORIES: 76,
  // Paper & Party Supplies
  PAPER_GOODS: 77,
  PARTY_SUPPLIES: 80,
  // Books, Movies & Music
  BOOKS: 81,
  MUSIC: 84,
  // Pet Supplies
  PET_SUPPLIES: 85,
  // Toys & Games
  TOYS: 86,
  GAMES: 89,
} as const;
