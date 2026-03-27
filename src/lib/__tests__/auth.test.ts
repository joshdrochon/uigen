import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSignInstance, mockCookieStore } = vi.hoisted(() => {
  const mockSignInstance = {
    setProtectedHeader: vi.fn().mockReturnThis(),
    setExpirationTime: vi.fn().mockReturnThis(),
    setIssuedAt: vi.fn().mockReturnThis(),
    sign: vi.fn().mockResolvedValue("mock-jwt-token"),
  };
  const mockCookieStore = { set: vi.fn(), get: vi.fn(), delete: vi.fn() };
  return { mockSignInstance, mockCookieStore };
});

vi.mock("server-only", () => ({}));
vi.mock("jose", () => ({
  SignJWT: vi.fn(() => mockSignInstance),
  jwtVerify: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue(mockCookieStore),
}));

import { createSession, getSession, deleteSession, verifySession } from "../auth";
import { NextRequest } from "next/server";
import { SignJWT, jwtVerify } from "jose";

describe("createSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("signs a JWT containing userId and email", async () => {
    await createSession("user-123", "test@example.com");

    expect(SignJWT).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-123", email: "test@example.com" })
    );
    expect(mockSignInstance.setProtectedHeader).toHaveBeenCalledWith({ alg: "HS256" });
    expect(mockSignInstance.setExpirationTime).toHaveBeenCalledWith("7d");
    expect(mockSignInstance.sign).toHaveBeenCalled();
  });

  it("sets the auth-token cookie with the signed JWT", async () => {
    await createSession("user-123", "test@example.com");

    expect(mockCookieStore.set).toHaveBeenCalledWith(
      "auth-token",
      "mock-jwt-token",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" })
    );
  });

  it("sets secure flag only in production", async () => {
    const originalEnv = process.env.NODE_ENV;

    vi.stubEnv("NODE_ENV", "production");
    await createSession("user-123", "test@example.com");
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      "auth-token",
      "mock-jwt-token",
      expect.objectContaining({ secure: true })
    );

    vi.clearAllMocks();

    vi.stubEnv("NODE_ENV", "development");
    await createSession("user-123", "test@example.com");
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      "auth-token",
      "mock-jwt-token",
      expect.objectContaining({ secure: false })
    );

    vi.stubEnv("NODE_ENV", originalEnv);
  });

  it("sets cookie expiry approximately 7 days from now", async () => {
    const before = Date.now();
    await createSession("user-123", "test@example.com");
    const after = Date.now();

    const { expires } = mockCookieStore.set.mock.calls[0][2] as { expires: Date };
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    expect(expires.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
    expect(expires.getTime()).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
  });
});

describe("getSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when no cookie is present", async () => {
    mockCookieStore.get.mockReturnValue(undefined);

    const session = await getSession();

    expect(session).toBeNull();
  });

  it("returns the session payload when the token is valid", async () => {
    const mockPayload = { userId: "user-123", email: "test@example.com", expiresAt: new Date() };
    mockCookieStore.get.mockReturnValue({ value: "valid-token" });
    vi.mocked(jwtVerify).mockResolvedValue({ payload: mockPayload } as any);

    const session = await getSession();

    expect(jwtVerify).toHaveBeenCalledWith("valid-token", expect.anything());
    expect(session).toEqual(mockPayload);
  });

  it("returns null when jwtVerify throws", async () => {
    mockCookieStore.get.mockReturnValue({ value: "expired-token" });
    vi.mocked(jwtVerify).mockRejectedValue(new Error("Token expired"));

    const session = await getSession();

    expect(session).toBeNull();
  });
});

describe("deleteSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the auth-token cookie", async () => {
    await deleteSession();

    expect(mockCookieStore.delete).toHaveBeenCalledWith("auth-token");
  });
});

describe("verifySession", () => {
  beforeEach(() => vi.clearAllMocks());

  const makeRequest = (token?: string) => {
    const req = new NextRequest("http://localhost/api/chat");
    if (token) {
      req.cookies.set("auth-token", token);
    }
    return req;
  };

  it("returns null when no cookie is present", async () => {
    const session = await verifySession(makeRequest());

    expect(session).toBeNull();
  });

  it("returns the session payload when the token is valid", async () => {
    const mockPayload = { userId: "user-123", email: "test@example.com", expiresAt: new Date() };
    vi.mocked(jwtVerify).mockResolvedValue({ payload: mockPayload } as any);

    const session = await verifySession(makeRequest("valid-token"));

    expect(jwtVerify).toHaveBeenCalledWith("valid-token", expect.anything());
    expect(session).toEqual(mockPayload);
  });

  it("returns null when jwtVerify throws", async () => {
    vi.mocked(jwtVerify).mockRejectedValue(new Error("Token expired"));

    const session = await verifySession(makeRequest("expired-token"));

    expect(session).toBeNull();
  });
});
