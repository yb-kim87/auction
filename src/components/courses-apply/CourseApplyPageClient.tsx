"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchLandingImages, type LandingImage } from "@/lib/api";
import { HeaderAuthArea, HeaderBell, useHeaderAuth } from "@/components/course-site/CourseSiteHeaderAuth";

const DETAIL_IMAGE_KEYS = Array.from({ length: 23 }, (_, i) => `detail-${i + 1}`);

/** barojp.com/courses/7 (수강신청 페이지)를 색상만 보라 톤으로 바꿔
 * 레이아웃/구조/문구를 최대한 동일하게 재현한 페이지.
 * barojp 고유 프로모션 문구("0원 챌린지", "전화일본어 티켓" 등)는
 * 구조는 유지하되 코치픽 맥락에 맞는 자연스러운 문구로 치환했다. */

const ACCENT = "#5244d4";
const ACCENT_LIGHT = "#8b7cf8";
const ACCENT_SOFT = "#EFECFF";
const ACCENT_TINT = "#F7F5FF"; // barojp #FFF9F5 대응

type TabKey = "intro" | "curriculum" | "reviews" | "refund";

const TABS: { key: TabKey; label: string }[] = [
  { key: "intro", label: "강의소개" },
  { key: "curriculum", label: "커리큘럼" },
  { key: "reviews", label: "후기 (128)" },
  { key: "refund", label: "환불규정" },
];

interface Lesson {
  no: number;
  title: string;
  duration: string;
  free?: boolean;
  bonus?: boolean;
}

interface CurriculumSection {
  title: string;
  lessons: Lesson[];
}

// barojp 원본(9개 섹션 71개 레슨)과 섹션 구성·레슨 개수·보너스 항목
// 위치까지 동일하게 맞추고, 제목만 코치픽 실전 강의 맥락으로 치환했다.
const CURRICULUM: CurriculumSection[] = [
  {
    title: "OT",
    lessons: [
      { no: 0, title: "OT 1강) 이론 몰라도 됩니다. 핵심 조각만 모으면 실전이 완성!", duration: "10:00", free: true },
      { no: 0, title: "OT 2강) 60일 후, 당신은 실전에서 바로 적용하고 있습니다", duration: "12:00", free: true },
    ],
  },
  {
    title: "1주차 - 기초 다지기",
    lessons: [
      { no: 1, title: "1강) 억지로 외우지 마세요. 말하면서 자연스럽게 기초 익히는 방법", duration: "15:00" },
      { no: 2, title: "2강) 조각 하나만 알면 벌써 10가지 상황에 대응할 수 있어요!", duration: "17:52" },
      { no: 3, title: "3강) 핵심 조각 붙이기만 하면 케이스가 술술 읽혀요", duration: "15:00" },
      { no: 4, title: "4강) 복잡한 자료도 술술 이해하는 방법", duration: "15:00" },
      { no: 5, title: "5강) 이해할 수 있으면 바로 적용할 수 있어요. 따라해봐요!", duration: "15:00" },
      { no: 6, title: "6강) \"이건 뭐죠?\", \"어떻게 하죠?\" 실전 필수 질문 만드는 법", duration: "15:00" },
      { no: 7, title: "7강) 질문 조각으로 뭐든 물어보는 방법", duration: "15:00" },
      { no: 8, title: "8강) 자연스럽게 첫인상 남기는 법", duration: "15:00" },
      { no: 9, title: "9강) 1주 만에 벌써 이만큼 할 수 있게 됐어요!", duration: "15:00" },
    ],
  },
  {
    title: "2주차 - 핵심 패턴",
    lessons: [
      { no: 10, title: "10강) 기본 패턴 배우고 바로 적용하는 법", duration: "15:00" },
      { no: 11, title: "11강) \"이거요\" \"저거요\" 콕 집어 말하기", duration: "15:00" },
      { no: 12, title: "12강) 편하게 물어보는 캐주얼 표현", duration: "15:00" },
      { no: 13, title: "13강) 조각 붙이기 훈련 - \"이게\" \"저게\" 자유자재로 말해봐요", duration: "15:00" },
      { no: 14, title: "14강) \"여기서\" \"저기서\" 상황 표현 완벽하게 익히기", duration: "15:00" },
      { no: 15, title: "15강) 숫자·수치 표현 한번에!", duration: "15:00" },
      { no: 16, title: "16강) 2주 만에 상담부터 제안까지 뚝딱 해봐요", duration: "16:02" },
      { no: 0, title: "1:1 코칭 세션 10분 티켓! (프리미엄 패키지)", duration: "10:00", bonus: true },
      { no: 0, title: "보너스특강) 2주차 정리 및 활용 + 2주차 코칭 전 이렇게 해보세요! (프리미엄 패키지)", duration: "23:56", bonus: true },
    ],
  },
  {
    title: "3주차 - 정중한 표현과 리액션",
    lessons: [
      { no: 17, title: "17강) 정중한 표현의 비밀 - 이것만 붙이면 끝!", duration: "15:00" },
      { no: 18, title: "18강) \"좋다\" \"만족스럽다\" 반응 표현 한방에 끝내는 법", duration: "15:00" },
      { no: 19, title: "19강) \"좋았어요\" \"만족했어요\" 과거형으로 말하기", duration: "15:00" },
      { no: 20, title: "20강) 느낌 조각 합쳐서 문장 만들어봐요", duration: "15:00" },
      { no: 21, title: "21강) \"친절하다\" \"효율적이다\" 평가 표현하는 방법", duration: "15:00" },
      { no: 22, title: "22강) 평가 표현도 과거형으로 술술 바꾸기", duration: "15:00" },
      { no: 23, title: "23강) 3주 만에 상담에서 자유자재로 말할 수 있어져요!", duration: "15:00" },
    ],
  },
  {
    title: "4주차 - 실전 대응",
    lessons: [
      { no: 24, title: "24강) 행동 조각의 기본 - 이것만 붙이면 정중한 표현 완성!", duration: "15:00" },
      { no: 25, title: "25강) 자주 쓰는 행동 조각 10개 한방에!", duration: "15:00" },
      { no: 26, title: "26강) 행동 조각 변신시키는 법 - 정중한 표현으로 바꿔봐요", duration: "15:00" },
      { no: 27, title: "27강) 특별한 행동 표현 패턴 익히기", duration: "15:00" },
      { no: 28, title: "28강) 특별한 행동 조각도 뚝딱 변신시켜봐요", duration: "15:00" },
      { no: 29, title: "29강) \"지금 진행 중이에요\" 진행형 표현 완벽 정복!", duration: "15:00" },
      { no: 30, title: "30강) 조각 3개 연결하면 긴 문장도 술술!", duration: "15:00" },
      { no: 31, title: "31강) 4주 만에 제안부터 확정까지 완벽하게 해봐요", duration: "15:00" },
      { no: 0, title: "1:1 코칭 세션 10분 티켓! (프리미엄 패키지)", duration: "10:00", bonus: true },
    ],
  },
  {
    title: "5주차 - 응용과 실전 표현",
    lessons: [
      { no: 32, title: "32강) 느낌 조각 활용 - 더 자연스럽게 말하는 법", duration: "15:00" },
      { no: 33, title: "33강) 느낌 조각 응용 - 문장 길게 이어 말하기", duration: "15:00" },
      { no: 34, title: "34강) \"하고, 진행하고, 검토하고\" 여러 행동 연결하는 법", duration: "15:00" },
      { no: 35, title: "35강) 특별한 행동도 연결해서 술술 말하기", duration: "15:00" },
      { no: 36, title: "36강) 전문 용어도 외우지 마세요. 자료 읽으면서 자연스럽게 익히는 법", duration: "15:00" },
      { no: 37, title: "37강) 핵심 용어 완전 정복!", duration: "15:00" },
      { no: 38, title: "38강) 5주 차 쉬어가기 - 실전 케이스 힌트", duration: "15:00" },
    ],
  },
  {
    title: "6주차 - 케이스와 리액션",
    lessons: [
      { no: 39, title: "39강) 상황별 인사 완벽하게 하는 법", duration: "15:00" },
      { no: 40, title: "40강) 분위기를 모아! - 상황, 맥락 표현해봐요", duration: "15:00" },
      { no: 41, title: "41강) 이론과 실전은 달라요 - 진짜 실전 감각 배우기", duration: "15:00" },
      { no: 42, title: "42강) 자연스러운 리액션 모음 - 자연스럽게 반응하는 법", duration: "15:00" },
      { no: 43, title: "43강) 이건 실수인가요? - 실전 시 주의사항 총정리", duration: "15:00" },
      { no: 44, title: "44강) \"~이지만\" \"만약에\" 문장 연결 조각 활용하기", duration: "15:00" },
      { no: 45, title: "45강) 조각 활용해서 문장 쭉쭉 늘리는 법", duration: "15:00" },
      { no: 46, title: "46강) 6주 완성 - 실전 사례로 재미있게 복습!", duration: "15:00" },
      { no: 0, title: "1:1 코칭 세션 10분 티켓! (프리미엄 패키지)", duration: "10:00", bonus: true },
      { no: 0, title: "실전 감각을 익혀봐요! (프리미엄 패키지 전용)", duration: "", bonus: true },
    ],
  },
  {
    title: "7주차 - 실전 적용",
    lessons: [
      { no: 47, title: "47강) 첫 미팅부터 아이스브레이킹까지 완벽 정복", duration: "15:00" },
      { no: 48, title: "48강) 방향을 잃었을 때 이렇게 말하세요", duration: "15:00" },
      { no: 49, title: "49강) 프로세스 진행하는 법 - 단계별로 한번에!", duration: "15:00" },
      { no: 50, title: "50강) 우선순위 정하고 일정 확인하는 법", duration: "15:00" },
      { no: 51, title: "51강) 킥오프 - 목표 설정부터 역할 분담까지 뚝딱", duration: "15:00" },
      { no: 52, title: "52강) 마무리 회고도 술술 하는 방법", duration: "15:00" },
      { no: 53, title: "53강) 일정 조율하는 법 - 미팅, 리뷰 한번에!", duration: "15:00" },
      { no: 54, title: "54강) 7주 완성 - 일정 확인하고 변경까지 해봐요", duration: "15:00" },
    ],
  },
  {
    title: "8주차 - 완성",
    lessons: [
      { no: 55, title: "55강) 요청부터 마무리까지 완벽하게", duration: "15:00" },
      { no: 56, title: "56강) 조건 물어보고 확정하는 법", duration: "15:00" },
      { no: 57, title: "57강) 필요한 정보 찾고 처리까지 뚝딱", duration: "15:00" },
      { no: 58, title: "58강) 검토 & 피드백 받는 방법", duration: "15:00" },
      { no: 59, title: "59강) 세부 항목 확인하고 처리하는 법", duration: "15:00" },
      { no: 60, title: "60강) 문제 발생했을 때 상황 술술 설명하는 방법", duration: "15:00" },
      { no: 61, title: "61강) 막혔을 때 대처법 & 실전 꿀팁 총정리", duration: "15:00" },
      { no: 62, title: "62강) 자유 대화 훈련 - 하고 싶은 말 마음껏 뱉어봐요!", duration: "15:00" },
      { no: 63, title: "63강) 8주 완성! 웬만한 상황은 전부 대응할 수 있게 됐어요", duration: "20:00" },
      { no: 0, title: "1:1 코칭 세션 10분 티켓! (프리미엄 패키지)", duration: "10:00", bonus: true },
    ],
  },
];

interface Review {
  name: string;
  date: string;
  pkg: string;
  text: string;
  helpful: number;
}

const REVIEWS: Review[] = [
  { name: "yuna_99", date: "2026. 7. 2.", pkg: "프리미엄 패키지", text: "핵심 조각만 익혔는데 실전에서 바로 적용이 돼서 신기했어요. 코치님 피드백도 꼼꼼하고 좋았습니다!", helpful: 412 },
  { name: "min_coach", date: "2026. 6. 28.", pkg: "스탠다드 패키지", text: "이론 위주 강의만 듣다가 실전 케이스 스터디 위주로 배우니까 훨씬 이해가 빨랐어요. 강추합니다.", helpful: 356 },
  { name: "jiyoon_91", date: "2026. 6. 15.", pkg: "프리미엄 패키지", text: "1:1 코칭 세션이 정말 도움이 많이 됐어요. 실전에서 막히는 부분을 바로바로 짚어주셔서 좋았습니다.", helpful: 298 },
];

export function CourseApplyPageClient() {
  const [activeTab, setActiveTab] = useState<TabKey>("intro");
  const [selectedPackage, setSelectedPackage] = useState<"standard" | "premium">("premium");
  const [soundOn, setSoundOn] = useState(false);
  const imagesQuery = useQuery({
    queryKey: ["landing-images"],
    queryFn: fetchLandingImages,
    staleTime: 5 * 60 * 1000,
  });
  const images = imagesQuery.data ?? null;
  const { profile: headerProfile, handleLogout } = useHeaderAuth();

  const logoLight = images?.find((img) => img.key === "logo-light")?.imageUrl ?? "";

  return (
    <div style={{ background: "#fff", minHeight: "100vh", fontFamily: "Pretendard, ui-sans-serif, system-ui, sans-serif" }}>
      {/* Header (barojp 원본 및 /courses 소개 페이지와 동일) */}
      <header style={{ position: "sticky", top: 0, zIndex: 100, background: "#fff", boxShadow: "0 1px 8px rgba(0,0,0,0.06)", padding: "12px 0" }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/courses" style={{ display: "flex", alignItems: "center" }}>
            {logoLight ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoLight} alt="강의실" style={{ height: 56, width: "auto" }} />
            ) : (
              <span style={{ fontSize: 24, fontWeight: 800, color: ACCENT }}>코치픽 강의실</span>
            )}
          </Link>
          <nav style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Link href="/courses" style={{ padding: "8px 16px", borderRadius: 999, fontSize: 18, fontWeight: 500, color: "#333", textDecoration: "none" }}>
              강의실 소개
            </Link>
            <Link href="/courses/webinar" style={{ padding: "8px 16px", borderRadius: 999, fontSize: 18, fontWeight: 500, color: "#333", textDecoration: "none" }}>
              무료웨비나
            </Link>
            <Link href="/courses/apply" style={{ padding: "8px 16px", borderRadius: 999, fontSize: 18, fontWeight: 700, color: ACCENT, background: ACCENT_SOFT, textDecoration: "none" }}>
              수강신청
            </Link>
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <HeaderBell profile={headerProfile} />
            <Link
              href="/courses/my"
              style={{ padding: "8px 20px", borderRadius: 999, background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_LIGHT})`, color: "#fff", fontWeight: 700, fontSize: 18, textDecoration: "none" }}
            >
              내 강의실
            </Link>
            <HeaderAuthArea profile={headerProfile} handleLogout={handleLogout} />
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "32px 20px" }} className="apply-root">
        <div style={{ display: "flex", gap: 32 }} className="apply-flex">
          {/* 좌측 컬럼 */}
          <div style={{ width: "100%" }} className="apply-left">
            {/* 히어로 영상 */}
            <div style={{ position: "relative", width: "100%", background: "#000", borderRadius: 24, overflow: "hidden", aspectRatio: "16/9" }}>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.4)", fontSize: 14 }}>
                강의 소개 영상
              </div>
              <button
                type="button"
                onClick={() => setSoundOn((v) => !v)}
                style={{ position: "absolute", bottom: 20, right: 20, display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 999, background: "rgba(255,255,255,0.9)", color: "#333", border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
              >
                {soundOn ? "소리 끄기" : "소리 켜기"}
              </button>
            </div>

            {/* 모바일 전용 정보 카드 */}
            <MobileInfoCard selectedPackage={selectedPackage} onSelectPackage={setSelectedPackage} />

            {/* 탭 네비게이션 */}
            <div style={{ position: "sticky", top: 80, zIndex: 20, background: "#fff", borderRadius: 12, border: "1px solid #eee", display: "flex", marginTop: 16 }}>
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    flex: 1,
                    padding: "14px 0",
                    border: "none",
                    background: activeTab === tab.key ? ACCENT : "transparent",
                    color: activeTab === tab.key ? "#fff" : "#4b5563",
                    fontWeight: 700,
                    fontSize: 15,
                    borderRadius: 12,
                    cursor: "pointer",
                    transition: "0.2s",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 무료 OT 강의 박스 */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eee", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", padding: 24, marginTop: 16 }}>
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontWeight: 800, fontSize: 17, color: "#111", marginBottom: 4 }}>🎬 무료 OT 강의</p>
                <p style={{ color: "#888", fontSize: 14 }}>코치픽 실전 강의를 먼저 무료로 체험해보세요!</p>
              </div>
              {[
                { title: "OT 1강) 이론 몰라도 됩니다. 핵심 조각만 모으면 실전이 완성!", duration: "10:00" },
                { title: "OT 2강) 60일 후, 당신은 실전에서 바로 적용하고 있습니다", duration: "12:00" },
              ].map((lesson) => (
                <div key={lesson.title} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 0", borderTop: "1px solid #f3f4f6" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 999, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <PlayIcon color="#fff" size={16} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600, fontSize: 15, color: "#111" }}>{lesson.title}</p>
                    <p style={{ color: "#9ca3af", fontSize: 13 }}>{lesson.duration}</p>
                  </div>
                  <span style={{ padding: "4px 12px", borderRadius: 999, background: "#dcfce7", color: "#15803d", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>무료 시청</span>
                </div>
              ))}
            </div>

            {/* id="intro" 강의소개 */}
            <section id="intro" style={{ marginTop: 32 }}>
              <IntroSection images={images} />
            </section>

            {/* id="curriculum" 커리큘럼 */}
            <section id="curriculum" style={{ marginTop: 32 }}>
              <CurriculumAccordion />
            </section>

            {/* id="reviews" 후기 */}
            <section id="reviews" style={{ marginTop: 32 }}>
              <ReviewsSection />
            </section>

            {/* id="refund" 환불규정 */}
            <section id="refund" style={{ marginTop: 32, marginBottom: 80 }}>
              <RefundSection />
            </section>
          </div>

          {/* 우측 사이드바 (데스크탑 전용) */}
          <div className="apply-sidebar" style={{ width: 380, flexShrink: 0 }}>
            <PurchaseSidebar selectedPackage={selectedPackage} onSelectPackage={setSelectedPackage} />
          </div>
        </div>
      </div>

      {/* 모바일 전용 하단 고정바 */}
      <MobileBottomBar />

      <style>{`
        .apply-flex { flex-direction: row; }
        .apply-sidebar { display: block; }
        .mobile-only { display: none; }
        @media (max-width: 900px) {
          .apply-flex { flex-direction: column; }
          .apply-sidebar { display: none; }
          .mobile-only { display: block; }
        }
        @keyframes applyBlink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

function PlayIcon({ size = 20, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function StarRow({ count = 5, size = 16 }: { count?: number; size?: number }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {Array.from({ length: count }).map((_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill={ACCENT}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

function PackageOption({
  kind,
  selected,
  onSelect,
}: {
  kind: "standard" | "premium";
  selected: boolean;
  onSelect: () => void;
}) {
  const isPremium = kind === "premium";
  return (
    <div
      onClick={onSelect}
      style={{
        position: "relative",
        cursor: "pointer",
        border: `2px solid ${selected ? ACCENT : "#e5e7eb"}`,
        background: isPremium && selected ? ACCENT_TINT : "#fff",
        borderRadius: 16,
        padding: 20,
        marginBottom: 12,
      }}
    >
      {isPremium && (
        <span style={{ position: "absolute", top: -10, left: 16, background: ACCENT, color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999 }}>
          추천
        </span>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p style={{ fontWeight: 800, fontSize: 16, color: "#111" }}>{isPremium ? "프리미엄 패키지 (챌린지)" : "스탠다드 패키지 (챌린지)"}</p>
          <p style={{ color: "#888", fontSize: 13, marginTop: 2 }}>{isPremium ? "60일 안에 실전 감각을 마스터하고 싶다면!" : "가볍게 시작하고 싶다면"}</p>
        </div>
        <div style={{ width: 20, height: 20, borderRadius: 999, border: `2px solid ${selected ? ACCENT : "#d1d5db"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {selected && <div style={{ width: 10, height: 10, borderRadius: 999, background: ACCENT }} />}
        </div>
      </div>
      <div style={{ marginTop: 12, display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ background: "#fee2e2", color: "#dc2626", fontSize: 12, fontWeight: 700, padding: "2px 6px", borderRadius: 4 }}>{isPremium ? "87%" : "90%"}</span>
        <span style={{ color: "#9ca3af", fontSize: 13, textDecoration: "line-through" }}>{isPremium ? "₩3,190,000" : "₩2,490,000"}</span>
        <span style={{ color: "#111", fontWeight: 800, fontSize: 18 }}>{isPremium ? "₩399,000" : "₩239,000"}</span>
      </div>
      <p style={{ color: ACCENT, fontSize: 12, marginTop: 2 }}>{isPremium ? "월 33,250원" : "월 19,917원"}</p>
      <ul style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        {(isPremium
          ? [
              "코치픽 실전 강의 VOD (180일 수강권)",
              "실전 케이스 노트 (영구소장) 매 주차 지급 총 8권",
              "핵심 요약 노트 2권",
              "현지 실전 표현집 1권 + 해설 VOD 포함",
              "1:1 코칭 세션 티켓 7회권",
            ]
          : [
              "코치픽 실전 강의 VOD (180일 수강권)",
              "핵심 요약 노트 2권 (전자책)",
              "실전 표현집 (영구 소장)",
            ]
        ).map((f, i) => (
          <li key={f} style={{ display: "flex", gap: 6, fontSize: 13, color: isPremium && i === 4 ? "#dc2626" : "#4b5563", fontWeight: isPremium && i === 4 ? 700 : 400 }}>
            <span style={{ color: ACCENT }}>✓</span> {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MobileInfoCard({
  selectedPackage,
  onSelectPackage,
}: {
  selectedPackage: "standard" | "premium";
  onSelectPackage: (p: "standard" | "premium") => void;
}) {
  return (
    <div className="mobile-only" style={{ padding: 16, background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", marginTop: 16 }}>
      <span style={{ display: "inline-block", background: ACCENT_SOFT, color: ACCENT, fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 999, marginBottom: 8 }}>
        🎯 지금 시작하면 첫 1주 무료 체험 🎯 <span style={{ opacity: 0.6 }}>(이용 약관 참고)</span>
      </span>
      <p style={{ color: "#9ca3af", fontSize: 12 }}>실전 강의</p>
      <h1 style={{ fontSize: 18, fontWeight: 800, color: "#111", lineHeight: 1.3 }}>딱 60일만에 실전 감각 마스터!</h1>
      <p style={{ fontSize: 16, fontWeight: 800, color: ACCENT, lineHeight: 1.3, marginTop: 4 }}>세상에 없던 코치픽 실전 강의</p>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
        <StarRow />
        <strong style={{ fontSize: 14 }}>5</strong>
        <span style={{ color: "#9ca3af", fontSize: 13 }}>(128개의 후기)</span>
      </div>
      <p style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginTop: 16, marginBottom: 8 }}>패키지 선택</p>
      <PackageOption kind="standard" selected={selectedPackage === "standard"} onSelect={() => onSelectPackage("standard")} />
      <PackageOption kind="premium" selected={selectedPackage === "premium"} onSelect={() => onSelectPackage("premium")} />
      <div style={{ background: `linear-gradient(90deg, ${ACCENT_TINT}, #fff)`, border: `1px solid ${ACCENT_SOFT}`, borderRadius: 12, padding: 12, marginTop: 8 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>🎯 1주 무료 체험 마감 임박!</p>
        <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>선착순 마감 · 지금 바로 시작해보세요</p>
      </div>
    </div>
  );
}

function IntroSection({ images }: { images: LandingImage[] | null }) {
  const detailImages = DETAIL_IMAGE_KEYS.map((key) => images?.find((img) => img.key === key)?.imageUrl).filter(
    (url): url is string => Boolean(url),
  );

  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eee", overflow: "hidden" }}>
      <p style={{ fontWeight: 800, fontSize: 20, color: "#111", padding: "24px 24px 0" }}>강의소개</p>
      <div style={{ marginTop: 16 }}>
        {detailImages.length > 0 ? (
          detailImages.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={url} alt={`강의소개 ${i + 1}`} style={{ width: "100%", height: "auto", display: "block" }} loading={i === 0 ? "eager" : "lazy"} />
          ))
        ) : (
          <div
            style={{
              margin: 24,
              borderRadius: 16,
              overflow: "hidden",
              background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_LIGHT})`,
              color: "#fff",
              padding: "48px 32px",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>핵심 조각 3개로 시작하는 실전 강의</p>
            <p style={{ opacity: 0.9, lineHeight: 1.7 }}>
              이론부터 차근차근 배우지 마시고<br />
              코치픽과 함께 실전 감각부터 익혀보세요.<br />
              60일이면 충분히 마스터할 수 있습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function CurriculumAccordion() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eee", padding: 24 }}>
      <p style={{ fontWeight: 800, fontSize: 20, color: "#111" }}>📚 전체 커리큘럼</p>
      <p style={{ color: "#9ca3af", fontSize: 14, marginBottom: 20 }}>
        {CURRICULUM.length}개 섹션 · {CURRICULUM.reduce((sum, s) => sum + s.lessons.length, 0)}개 레슨
      </p>
      {CURRICULUM.map((section, idx) => {
        const isOpen = openIdx === idx;
        return (
          <div key={section.title} style={{ borderTop: idx === 0 ? "none" : "1px solid #f3f4f6", paddingTop: idx === 0 ? 0 : 16, marginTop: idx === 0 ? 0 : 16 }}>
            <button
              type="button"
              onClick={() => setOpenIdx(isOpen ? null : idx)}
              style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
            >
              <span style={{ width: 28, height: 28, borderRadius: 999, background: ACCENT, color: "#fff", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {idx + 1}
              </span>
              <span style={{ fontWeight: 700, fontSize: 15, color: "#111", flex: 1 }}>{section.title}</span>
              <span style={{ color: "#9ca3af", transform: isOpen ? "rotate(180deg)" : "none", transition: "0.2s" }}>▾</span>
            </button>
            {isOpen && (
              <div style={{ marginLeft: 40, marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                {section.lessons.map((lesson, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {lesson.free ? (
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <PlayIcon size={14} />
                      </div>
                    ) : (
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: "#f3f4f6", color: "#9ca3af", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {lesson.no || "★"}
                      </div>
                    )}
                    <span style={{ fontSize: 14, color: "#374151", flex: 1 }}>{lesson.title}</span>
                    {lesson.duration && <span style={{ fontSize: 12, color: "#9ca3af" }}>{lesson.duration}</span>}
                    {lesson.free && <span style={{ padding: "2px 10px", borderRadius: 999, background: "#dcfce7", color: "#15803d", fontSize: 11, fontWeight: 700 }}>무료 시청</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ReviewsSection() {
  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eee", overflow: "hidden" }}>
      <div style={{ padding: 24 }}>
        <p style={{ fontWeight: 800, fontSize: 20, color: "#111" }}>⭐ 수강 후기</p>
        <p style={{ color: "#9ca3af", fontSize: 14 }}>128개의 후기 · 평균 5.0점</p>
      </div>
      {REVIEWS.map((r) => (
        <div key={r.name} style={{ padding: 24, borderTop: "1px solid #f3f4f6" }}>
          <StarRow />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: "#111" }}>{r.name}</span>
            <span style={{ color: "#9ca3af", fontSize: 13 }}>{r.date}</span>
          </div>
          <span style={{ display: "inline-block", marginTop: 6, padding: "3px 10px", borderRadius: 999, background: "#f3f4f6", color: "#6b7280", fontSize: 12 }}>{r.pkg}</span>
          <p style={{ marginTop: 10, color: "#374151", fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{r.text}</p>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <span style={{ color: "#9ca3af", fontSize: 13 }}>👍 도움돼요 {r.helpful}</span>
          </div>
        </div>
      ))}
      <div style={{ background: "#f9fafb", padding: 16, display: "flex", justifyContent: "center", gap: 6 }}>
        {["<", 1, 2, 3, "›"].map((p, i) => (
          <button
            key={i}
            type="button"
            style={{
              minWidth: 32,
              height: 32,
              borderRadius: 8,
              border: "none",
              background: p === 1 ? ACCENT : "transparent",
              color: p === 1 ? "#fff" : "#6b7280",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function RefundSection() {
  const items = [
    { icon: "✓", color: "#16a34a", title: "구매일로부터 7일 이내 전액 환불", desc: "상품 구매일로부터 7일 이내에는 조건 없이 전액(100%) 환불이 가능합니다.", bullets: ["결제일로부터 7일 이내, 무료로 공개된 콘텐츠만 이용한 경우 전액 환불", "단, 수강기간이 종료된 이후에는 환불 불가"] },
    { icon: "✓", color: "#2563eb", title: "7일 경과 후 부분 환불", desc: "전체 수강기간 대비 잔여 수강기간 비율과 전체 강의 대비 미수강 강의 비율을 각각 산정하여, 두 비율 중 더 낮은 비율에 결제금액을 곱하여 환불 금액을 계산합니다." },
    { icon: "✕", color: "#dc2626", title: "환불 불가", desc: "수강기간이 종료되었거나 전체 강의를 수강(완강)한 경우 환불이 불가합니다." },
    { icon: "📞", color: "#6b7280", title: "1:1 코칭 세션", desc: "1:1 코칭 세션은 패키지에 포함된 구성으로, 별도 환불이 불가합니다. 환불 시 패키지 총 결제금액 기준으로 산정됩니다." },
  ];
  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #eee", padding: 24 }}>
      <p style={{ fontWeight: 800, fontSize: 20, color: "#111", marginBottom: 20 }}>📋 환불규정</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {items.map((it) => (
          <div key={it.title} style={{ display: "flex", gap: 16 }}>
            <div style={{ width: 32, height: 32, borderRadius: 999, background: `${it.color}1a`, color: it.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 700 }}>
              {it.icon}
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: 15, color: "#111", marginBottom: 4 }}>{it.title}</p>
              <p style={{ color: "#6b7280", fontSize: 13, lineHeight: 1.6 }}>{it.desc}</p>
              {it.bullets && (
                <ul style={{ marginTop: 6 }}>
                  {it.bullets.map((b) => (
                    <li key={b} style={{ color: "#9ca3af", fontSize: 13, lineHeight: 1.6 }}>· {b}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ background: "#f9fafb", borderRadius: 12, padding: 16, marginTop: 20, fontSize: 13, color: "#6b7280" }}>
        자세한 환불 규정은{" "}
        <Link href="/refund" style={{ color: ACCENT, fontWeight: 700, textDecoration: "underline" }}>
          환불규정 페이지
        </Link>
        에서 확인하실 수 있습니다.
      </div>
    </div>
  );
}

function PurchaseSidebar({
  selectedPackage,
  onSelectPackage,
}: {
  selectedPackage: "standard" | "premium";
  onSelectPackage: (p: "standard" | "premium") => void;
}) {
  return (
    <div style={{ position: "sticky", top: 96, background: "#fff", borderRadius: 16, border: "1px solid #eee", boxShadow: "0 8px 24px rgba(0,0,0,0.06)", maxHeight: "calc(100vh - 120px)", overflowY: "auto", padding: 24 }}>
      <span style={{ display: "inline-block", background: ACCENT_SOFT, color: ACCENT, fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 999, marginBottom: 8 }}>
        🎯 지금 시작하면 첫 1주 무료 체험 🎯 <span style={{ opacity: 0.6 }}>(이용 약관 참고)</span>
      </span>
      <p style={{ color: "#9ca3af", fontSize: 12 }}>실전 강의</p>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: "#111", lineHeight: 1.3 }}>딱 60일만에 실전 감각 마스터!</h1>
      <p style={{ fontSize: 16, fontWeight: 800, color: ACCENT, marginTop: 4 }}>세상에 없던 코치픽 실전 강의</p>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
        <StarRow />
        <strong style={{ fontSize: 14 }}>5</strong>
        <span style={{ color: "#9ca3af", fontSize: 13 }}>(128개의 후기)</span>
      </div>

      <div style={{ marginTop: 20 }}>
        <PackageOption kind="standard" selected={selectedPackage === "standard"} onSelect={() => onSelectPackage("standard")} />
        <PackageOption kind="premium" selected={selectedPackage === "premium"} onSelect={() => onSelectPackage("premium")} />
      </div>

      <div style={{ background: `linear-gradient(90deg, #131A24, #1e2a3a)`, borderRadius: 12, padding: 16, color: "#fff", marginTop: 4 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <span style={{ background: "rgba(255,255,255,0.15)", padding: "3px 10px", borderRadius: 999, fontSize: 11 }}>이번 기수 마감 임박</span>
          <span style={{ background: ACCENT, padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700 }}>{selectedPackage === "premium" ? "87%" : "90%"}</span>
        </div>
        <p style={{ fontSize: 13 }}>🎯 1주차 첫 강의 수강 시 Day 1 시작 · 신청 즉시 바로 학습을 시작할 수 있어요</p>
      </div>

      <div style={{ marginTop: 20 }}>
        <p style={{ fontSize: 13, color: "#6b7280" }}>첫 1주 무료 체험 시</p>
        <p style={{ fontSize: 40, fontWeight: 800, color: ACCENT }}>0원</p>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
          <span style={{ color: "#9ca3af", fontSize: 13, textDecoration: "line-through" }}>{selectedPackage === "premium" ? "3,190,000원" : "2,490,000원"}</span>
          <span style={{ background: "#fee2e2", color: "#dc2626", fontSize: 12, fontWeight: 700, padding: "2px 6px", borderRadius: 4 }}>{selectedPackage === "premium" ? "87%" : "90%"}</span>
          <span style={{ color: ACCENT, fontSize: 13 }}>{selectedPackage === "premium" ? "월 33,250원" : "월 19,917원"}</span>
        </div>

        <div style={{ border: `1px solid ${ACCENT_SOFT}`, background: ACCENT_TINT, borderRadius: 12, padding: 14, marginTop: 16 }}>
          <p style={{ fontWeight: 700, fontSize: 13, color: "#111", marginBottom: 8 }}>✅ 1주 무료 체험 조건</p>
          <ul style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {["매일 1분 이상 학습 인증 제출", "수업 내용 10줄 이상 요약 제출", "1주차 첫 강의 수강일부터 7일간 매일 제출 완료", "7일 완주 후 만족도 조사 참여"].map((b) => (
              <li key={b} style={{ fontSize: 12, color: "#4b5563" }}>· {b}</li>
            ))}
          </ul>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: "1px solid #f3f4f6", marginTop: 12, fontSize: 13 }}>
          <span style={{ color: "#6b7280" }}>수강기간</span>
          <span style={{ fontWeight: 700, color: "#111" }}>180일 (챌린지 기간)</span>
        </div>

        <button
          type="button"
          style={{ width: "100%", background: ACCENT, color: "#fff", fontSize: 17, fontWeight: 700, padding: "16px 0", borderRadius: 12, border: "none", cursor: "pointer", boxShadow: `0 8px 20px ${ACCENT}40`, marginTop: 8 }}
        >
          1주 무료 체험 신청하기 →
        </button>
      </div>
    </div>
  );
}

function MobileBottomBar() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(true);
  }, []);
  if (!visible) return null;
  return (
    <div className="mobile-only" style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 30 }}>
      <div style={{ background: "#dc2626", color: "#fff", fontSize: 12, padding: "6px 16px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span>⚡ 첫 1주 무료 체험</span>
        <span style={{ opacity: 0.6 }}>|</span>
        <span>선착순</span>
        <span style={{ animation: "applyBlink 0.8s step-start infinite", fontWeight: 700 }}>마감 임박!</span>
        <span>· 지금 바로 시작해보세요</span>
      </div>
      <div style={{ background: "#fff", borderTop: "1px solid #eee", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 11, color: "#6b7280" }}>첫 1주</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: ACCENT }}>0원</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ color: "#9ca3af", fontSize: 12, textDecoration: "line-through" }}>3,190,000원</span>
            <span style={{ background: "#fee2e2", color: "#dc2626", fontSize: 11, fontWeight: 700, padding: "1px 5px", borderRadius: 4 }}>87%</span>
            <span style={{ color: ACCENT, fontSize: 12 }}>월 33,250원</span>
          </div>
        </div>
        <button
          type="button"
          style={{ background: ACCENT, color: "#fff", fontWeight: 700, fontSize: 14, padding: "12px 24px", borderRadius: 999, border: "none", whiteSpace: "nowrap" }}
        >
          무료 체험 신청 →
        </button>
      </div>
    </div>
  );
}
