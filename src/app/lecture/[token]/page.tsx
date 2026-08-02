import { redirect } from "next/navigation";

/** 2026-08-02부로 강의 다시보기는 회원 로그인 + 수강권(enrollment)
 * 기반(`/courses`, `/courses/[courseId]`)으로 전환했다. 링크 토큰
 * 방식(`LectureReplayClient.tsx`, `lecture_access_links` 테이블/API)은
 * 이미 공유됐을 수 있는 기존 링크 때문에 코드는 남겨두되, 접속 시
 * 로그인 후 내 강의 목록으로 보낸다. */
export default function LectureReplayPage() {
  redirect("/courses");
}
