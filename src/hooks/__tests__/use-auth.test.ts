import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

import { useRouter } from "next/navigation";
import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";
import { useAuth } from "@/hooks/use-auth";

describe("useAuth", () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as any);
    vi.mocked(getAnonWorkData).mockReturnValue(null);
    vi.mocked(getProjects).mockResolvedValue([]);
    vi.mocked(createProject).mockResolvedValue({ id: "new-project-id" } as any);
  });

  afterEach(() => {
    cleanup();
  });

  describe("isLoading", () => {
    it("starts as false", () => {
      const { result } = renderHook(() => useAuth());
      expect(result.current.isLoading).toBe(false);
    });

    it("is true while signIn is in flight, then false after", async () => {
      let resolveSignIn!: (v: any) => void;
      vi.mocked(signInAction).mockReturnValue(
        new Promise((res) => { resolveSignIn = res; })
      );

      const { result } = renderHook(() => useAuth());

      act(() => { result.current.signIn("a@b.com", "pw"); });
      expect(result.current.isLoading).toBe(true);

      await act(async () => { resolveSignIn({ success: false }); });
      expect(result.current.isLoading).toBe(false);
    });

    it("is true while signUp is in flight, then false after", async () => {
      let resolveSignUp!: (v: any) => void;
      vi.mocked(signUpAction).mockReturnValue(
        new Promise((res) => { resolveSignUp = res; })
      );

      const { result } = renderHook(() => useAuth());

      act(() => { result.current.signUp("a@b.com", "pw"); });
      expect(result.current.isLoading).toBe(true);

      await act(async () => { resolveSignUp({ success: false }); });
      expect(result.current.isLoading).toBe(false);
    });

    it("resets isLoading to false even when signIn throws", async () => {
      vi.mocked(signInAction).mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await expect(result.current.signIn("a@b.com", "pw")).rejects.toThrow("Network error");
      });

      expect(result.current.isLoading).toBe(false);
    });

    it("resets isLoading to false even when signUp throws", async () => {
      vi.mocked(signUpAction).mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await expect(result.current.signUp("a@b.com", "pw")).rejects.toThrow("Network error");
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe("signIn", () => {
    it("calls signInAction with the given credentials", async () => {
      vi.mocked(signInAction).mockResolvedValue({ success: false });

      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signIn("user@example.com", "s3cr3t"); });

      expect(signInAction).toHaveBeenCalledWith("user@example.com", "s3cr3t");
    });

    it("returns the result from signInAction", async () => {
      const mockResult = { success: false, error: "Invalid credentials" };
      vi.mocked(signInAction).mockResolvedValue(mockResult);

      const { result } = renderHook(() => useAuth());
      let returnValue: any;
      await act(async () => { returnValue = await result.current.signIn("a@b.com", "pw"); });

      expect(returnValue).toEqual(mockResult);
    });

    it("does not redirect when signIn fails", async () => {
      vi.mocked(signInAction).mockResolvedValue({ success: false, error: "Bad credentials" });

      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signIn("a@b.com", "wrong"); });

      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe("signUp", () => {
    it("calls signUpAction with the given credentials", async () => {
      vi.mocked(signUpAction).mockResolvedValue({ success: false });

      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signUp("new@example.com", "pass123"); });

      expect(signUpAction).toHaveBeenCalledWith("new@example.com", "pass123");
    });

    it("returns the result from signUpAction", async () => {
      const mockResult = { success: false, error: "Email already taken" };
      vi.mocked(signUpAction).mockResolvedValue(mockResult);

      const { result } = renderHook(() => useAuth());
      let returnValue: any;
      await act(async () => { returnValue = await result.current.signUp("a@b.com", "pw"); });

      expect(returnValue).toEqual(mockResult);
    });

    it("does not redirect when signUp fails", async () => {
      vi.mocked(signUpAction).mockResolvedValue({ success: false });

      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signUp("a@b.com", "pw"); });

      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe("post sign-in redirect — anonymous work present", () => {
    const anonWork = {
      messages: [{ id: "1", role: "user", content: "Hello" }],
      fileSystemData: { "/App.tsx": { type: "file", content: "export default () => <div />" } },
    };

    beforeEach(() => {
      vi.mocked(signInAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue(anonWork);
      vi.mocked(createProject).mockResolvedValue({ id: "anon-project-id" } as any);
    });

    it("creates a project with the anonymous work data", async () => {
      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signIn("a@b.com", "pw"); });

      expect(createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: anonWork.messages,
          data: anonWork.fileSystemData,
        })
      );
    });

    it("clears anonymous work after creating the project", async () => {
      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signIn("a@b.com", "pw"); });

      expect(clearAnonWork).toHaveBeenCalled();
    });

    it("redirects to the new project", async () => {
      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signIn("a@b.com", "pw"); });

      expect(mockPush).toHaveBeenCalledWith("/anon-project-id");
    });

    it("does not fetch existing projects when anon work is present", async () => {
      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signIn("a@b.com", "pw"); });

      expect(getProjects).not.toHaveBeenCalled();
    });
  });

  describe("post sign-in redirect — no anonymous work, existing projects", () => {
    beforeEach(() => {
      vi.mocked(signInAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue(null);
      vi.mocked(getProjects).mockResolvedValue([
        { id: "recent-project" } as any,
        { id: "older-project" } as any,
      ]);
    });

    it("redirects to the most recent project", async () => {
      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signIn("a@b.com", "pw"); });

      expect(mockPush).toHaveBeenCalledWith("/recent-project");
    });

    it("does not create a new project when one already exists", async () => {
      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signIn("a@b.com", "pw"); });

      expect(createProject).not.toHaveBeenCalled();
    });
  });

  describe("post sign-in redirect — no anonymous work, no existing projects", () => {
    beforeEach(() => {
      vi.mocked(signInAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue(null);
      vi.mocked(getProjects).mockResolvedValue([]);
      vi.mocked(createProject).mockResolvedValue({ id: "brand-new-project" } as any);
    });

    it("creates a new empty project", async () => {
      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signIn("a@b.com", "pw"); });

      expect(createProject).toHaveBeenCalledWith(
        expect.objectContaining({ messages: [], data: {} })
      );
    });

    it("redirects to the newly created project", async () => {
      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signIn("a@b.com", "pw"); });

      expect(mockPush).toHaveBeenCalledWith("/brand-new-project");
    });
  });

  describe("post sign-in redirect — anonymous work present but empty messages", () => {
    beforeEach(() => {
      vi.mocked(signInAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue({ messages: [], fileSystemData: {} });
      vi.mocked(getProjects).mockResolvedValue([{ id: "existing-project" } as any]);
    });

    it("falls through to existing projects when anon messages are empty", async () => {
      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signIn("a@b.com", "pw"); });

      expect(mockPush).toHaveBeenCalledWith("/existing-project");
      expect(clearAnonWork).not.toHaveBeenCalled();
    });
  });

  describe("signUp post-sign-in redirect", () => {
    it("runs the same redirect logic after a successful signUp", async () => {
      vi.mocked(signUpAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue(null);
      vi.mocked(getProjects).mockResolvedValue([{ id: "proj-after-signup" } as any]);

      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signUp("new@example.com", "pw"); });

      expect(mockPush).toHaveBeenCalledWith("/proj-after-signup");
    });
  });
});
