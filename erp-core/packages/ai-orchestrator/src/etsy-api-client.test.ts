// ============================================================
// Etsy API Client — Unit Tests
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EtsyApiClient, EtsyApiError } from "./etsy-api-client.js";

// ─── Mocks ─────────────────────────────────────────────────

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const { mockRandomBytes, mockCreateHash } = vi.hoisted(() => ({
  mockRandomBytes: vi.fn(),
  mockCreateHash: vi.fn(),
}));

vi.mock("crypto", () => ({
  default: {
    randomBytes: mockRandomBytes,
    createHash: mockCreateHash,
  },
}));

function createMockHash(returnValue: string) {
  return {
    update: vi.fn().mockReturnThis(),
    digest: vi.fn().mockReturnValue(returnValue),
  };
}

// ─── Test Config ───────────────────────────────────────────

const TEST_CONFIG = {
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  redirectUri: "http://localhost:3000/callback",
  scopes: ["listings_r", "listings_w", "shops_r"],
};

const TEST_TOKEN = {
  access_token: "test-access-token",
  refresh_token: "test-refresh-token",
  token_type: "Bearer",
  expires_in: 3600,
};

// ─── Tests ─────────────────────────────────────────────────

describe("EtsyApiClient", () => {
  let client: EtsyApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new EtsyApiClient(TEST_CONFIG);

    // Mock crypto for PKCE
    mockRandomBytes
      .mockReturnValueOnce(Buffer.from("a".repeat(32))) // verifier
      .mockReturnValueOnce(Buffer.from("b".repeat(16))); // state
    mockCreateHash.mockReturnValue(createMockHash("test-challenge-base64url"));
  });

  describe("generateAuthUrl", () => {
    it("should generate auth URL with PKCE params", () => {
      const result = client.generateAuthUrl();

      expect(result.url).toContain("https://www.etsy.com/oauth/connect");
      expect(result.url).toContain("response_type=code");
      expect(result.url).toContain("client_id=test-client-id");
      expect(result.url).toContain("code_challenge_method=S256");
      expect(result.codeVerifier).toBeDefined();
      expect(result.state).toBeDefined();
    });

    it("should include requested scopes", () => {
      const result = client.generateAuthUrl();
      expect(result.url).toContain("listings_r");
      expect(result.url).toContain("listings_w");
    });
  });

  describe("exchangeCode", () => {
    it("should exchange code for token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => TEST_TOKEN,
      });

      const token = await client.exchangeCode("test-code", "test-verifier");

      expect(token.access_token).toBe("test-access-token");
      expect(token.refresh_token).toBe("test-refresh-token");
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify the request
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe("https://api.etsy.com/v3/public/oauth/token");
      expect(callArgs[1].method).toBe("POST");
    });

    it("should throw on failed exchange", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "invalid_grant",
      });

      await expect(
        client.exchangeCode("bad-code", "bad-verifier"),
      ).rejects.toThrow(EtsyApiError);
    });
  });

  describe("API calls (authenticated)", () => {
    beforeEach(() => {
      // Set token so API calls work
      client.setToken(TEST_TOKEN);
    });

    describe("getMe", () => {
      it("should fetch current user", async () => {
        const mockUser = { user_id: 123, login_name: "testuser", primary_email: "test@test.com", create_date: 1234567890 };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockUser,
        });

        const user = await client.getMe();
        expect(user.user_id).toBe(123);
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining("/application/users/me"),
          expect.objectContaining({
            method: "GET",
            headers: expect.objectContaining({
              Authorization: "Bearer test-access-token",
            }),
          }),
        );
      });
    });

    describe("createDraftListing", () => {
      it("should create a draft listing", async () => {
        const mockListing = {
          listing_id: 456,
          title: "Test Listing",
          state: "draft",
          url: "https://www.etsy.com/listing/456",
        };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockListing,
        });

        const listing = await client.createDraftListing(789, {
          title: "Test Listing",
          description: "A test listing",
          price: 29.99,
          quantity: 1,
          taxonomy_id: 1,
          who_made: "i_did",
          when_made: "2020_2026",
          tags: ["art", "painting"],
          type: "physical",
        });

        expect(listing.listing_id).toBe(456);
        expect(listing.state).toBe("draft");
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining("/application/shops/789/listings"),
          expect.objectContaining({ method: "POST" }),
        );
      });
    });

    describe("uploadListingImage", () => {
      it("should upload image to listing", async () => {
        const mockImage = {
          listing_image_id: 789,
          listing_id: 456,
          rank: 1,
          url_fullxfull: "https://www.etsy.com/image/789",
        };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockImage,
        });

        const image = await client.uploadListingImage(789, {
          listingId: 456,
          imageBase64: "dGVzdC1pbWFnZS1kYXRh",
          rank: 1,
          altText: "Test image",
        });

        expect(image.listing_image_id).toBe(789);
        expect(image.rank).toBe(1);
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining("/application/shops/789/listings/456/images"),
          expect.objectContaining({ method: "POST" }),
        );
      });
    });

    describe("publishListing", () => {
      it("should publish draft listing", async () => {
        const mockListing = {
          listing_id: 456,
          state: "active",
          url: "https://www.etsy.com/listing/456",
        };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockListing,
        });

        const listing = await client.publishListing(789, 456);

        expect(listing.state).toBe("active");
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining("/application/shops/789/listings/456"),
          expect.objectContaining({ method: "PATCH" }),
        );
      });
    });

    describe("getListingsByShop", () => {
      it("should fetch all listings for a shop", async () => {
        const mockListings = {
          results: [
            { listing_id: 1, title: "Listing 1", state: "active" },
            { listing_id: 2, title: "Listing 2", state: "draft" },
          ],
        };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockListings,
        });

        const listings = await client.getListingsByShop(789);
        expect(listings).toHaveLength(2);
        expect(listings[0].title).toBe("Listing 1");
      });
    });

    describe("error handling", () => {
      it("should throw EtsyApiError on API error", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: async () => "Unauthorized",
        });

        await expect(client.getMe()).rejects.toThrow(EtsyApiError);
      });

      it("should throw if not authenticated", async () => {
        const unauthenticatedClient = new EtsyApiClient(TEST_CONFIG);
        await expect(unauthenticatedClient.getMe()).rejects.toThrow("Not authenticated");
      });
    });
  });
});
