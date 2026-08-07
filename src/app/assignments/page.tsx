"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 과제제출 방식 변경(사용자 요청, 2026-08-07) — 별도 페이지에서 직접
 * 제출하던 방식을 물건 상세(수익계산기)의 "과제제출" 버튼으로 옮기고,
 * 제출 현황은 내 물건 > 과제제출 탭에서 보게 했다. 이 경로로 들어오는
 * 기존 링크(입찰 달력, 서비스 제보 페이지 네비 등)를 깨뜨리지 않도록
 * 페이지 자체는 남겨두고 내 물건으로 안내만 한다. */
export default function AssignmentsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/favorites?tab=assignments");
  }, [router]);

  return null;
}
