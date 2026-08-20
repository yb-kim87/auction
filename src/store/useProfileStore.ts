import { create } from "zustand";
import { fetchMyProfile } from "@/lib/api";
import type { UserProfile } from "@/types/auction";

interface ProfileStore {
  profile: UserProfile | null;
  status: "idle" | "loading" | "loaded" | "error";
  error: string | null;
  fetchPromise: Promise<UserProfile> | null;
  /** 이미 로드됐거나 요청이 진행 중이면 그 결과를 재사용한다 — 여러 페이지가
   * 동시에 마운트돼도 /users/me 요청이 한 번만 나가게 하기 위함. */
  fetchProfile: (options?: { force?: boolean }) => Promise<UserProfile>;
  setProfile: (profile: UserProfile | null) => void;
  patchProfile: (patch: Partial<UserProfile>) => void;
  clearProfile: () => void;
}

export const useProfileStore = create<ProfileStore>((set, get) => ({
  profile: null,
  status: "idle",
  error: null,
  fetchPromise: null,
  fetchProfile: ({ force = false } = {}) => {
    const state = get();
    if (!force) {
      if (state.fetchPromise) return state.fetchPromise;
      if (state.status === "loaded" && state.profile) return Promise.resolve(state.profile);
    }
    set({ status: "loading", error: null });
    const promise = fetchMyProfile()
      .then((data) => {
        set({ profile: data, status: "loaded", error: null, fetchPromise: null });
        return data;
      })
      .catch((err) => {
        set({
          status: "error",
          error: err instanceof Error ? err.message : "회원 정보를 불러오지 못했습니다.",
          fetchPromise: null,
        });
        throw err;
      });
    set({ fetchPromise: promise });
    return promise;
  },
  setProfile: (profile) => set({ profile, status: profile ? "loaded" : "idle", error: null }),
  patchProfile: (patch) =>
    set((state) => (state.profile ? { profile: { ...state.profile, ...patch } } : state)),
  clearProfile: () => set({ profile: null, status: "idle", error: null, fetchPromise: null }),
}));
