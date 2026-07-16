"use client";

import { useEffect } from "react";
import { installAuthFetchInterceptor } from "@/lib/auth-fetch-interceptor";

/** 루트 레이아웃에서 한 번 마운트되어, accessToken 자동 재발급 인터셉터를 설치한다. */
export function AuthInit() {
  useEffect(() => {
    installAuthFetchInterceptor();
  }, []);
  return null;
}
