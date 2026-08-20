"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchLandingImages, type LandingImage } from "@/lib/api";
import { HeaderAuthArea, HeaderBell, useHeaderAuth } from "@/components/course-site/CourseSiteHeaderAuth";

/** barojp.com 메인 페이지를 JS 번들(index-DefAQ-XP.js)에서 직접 분석해
 * 레이아웃·수치·애니메이션 로직까지 그대로 재현한 강의실 소개 페이지.
 * 색상만 오렌지(#FF6600 계열) → 보라(#5244d4 계열, /courses/my와 동일)로 치환했다. */

const ACCENT = "#5244d4";
const ACCENT2 = "#6a4fd6"; // barojp #FF6B35 대응
const ACCENT3 = "#8b7cf8"; // barojp #FF8F5A 대응
const ACCENT_SOFT = "#EFECFF"; // barojp #FFF0EB 대응
const NAVY = "#131A24";

function getLandingImage(images: LandingImage[] | null, key: string): string {
  return images?.find((img) => img.key === key)?.imageUrl ?? "";
}

function useInView(threshold = 0.15) {
  // ref 콜백 방식: 대상 DOM이 조건부 렌더링(if (!url) return null 등)으로
  // 나중에 나타나도, DOM이 실제로 붙는 순간 콜백이 호출되어 옵저버가
  // 셋업된다. useEffect + useRef(object) 방식은 첫 렌더에서 DOM이 없으면
  // 이후 DOM이 생겨도 effect가 재실행되지 않아 옵저버가 영영 안 붙는
  // 버그가 있었다(커리큘럼 이미지가 API 로드 전엔 null을 반환하는 경우).
  const [inView, setInView] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (!el) return;
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              setInView(true);
              io.disconnect();
            }
          });
        },
        { threshold, rootMargin: "0px 0px -10% 0px" },
      );
      io.observe(el);
      observerRef.current = io;
    },
    [threshold],
  );
  return { ref, inView };
}

// ── 1) 고민 카드: barojp X6 배열, 1초마다 순환 강조 ─────────────────────────
const WORRIES = [
  { emoji: "😢", text: "단어는 아는데\n입을 떼려면 머릿속이 하얘진다.", tag: "#회화막막족" },
  { emoji: "📱", text: "단어장 앱부분만\n새까맣게 공부한 적이 있다", tag: "#단어부족" },
  { emoji: "👀", text: "일본인 앞에만 서면\n하나도 안 들린다", tag: "#실전감각부족" },
  { emoji: "😣", text: "듣고 해석은 되는데,\n정작 말은 안 나온다.", tag: "#학습불균형" },
];

function WorryCards() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setActive((s) => (s + 1) % WORRIES.length), 1000);
    return () => clearInterval(t);
  }, []);
  const { ref } = useInView();
  return (
    <div ref={ref} style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
      {WORRIES.map((w, i) => {
        const a = i === active;
        return (
          <div
            key={w.tag}
            style={{
              borderRadius: 16,
              padding: "32px",
              textAlign: "center",
              transition: "all 0.5s ease-in-out",
              transform: a ? "scale(1.02)" : "scale(1)",
              boxShadow: a ? "0 10px 30px rgba(82,68,212,0.3)" : "none",
              background: a ? ACCENT : "#F5F5F5",
              color: a ? "#fff" : "#1f2937",
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 16 }}>{w.emoji}</div>
            <p style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.6, whiteSpace: "pre-line", marginBottom: 20, color: a ? "#fff" : "#1f2937" }}>
              {w.text}
            </p>
            <span
              style={{
                display: "inline-block",
                padding: "6px 16px",
                borderRadius: 999,
                fontSize: 14,
                fontWeight: 700,
                transition: "all 0.5s ease-in-out",
                background: a ? "rgba(255,255,255,0.2)" : ACCENT,
                color: "#fff",
              }}
            >
              {w.tag}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── 2) 비교 섹션 ────────────────────────────────────────────────────────────
const OLD_STEPS = [
  { step: 1, text: "기초 개념 암기 (2주)" },
  { step: 2, text: "이론 정리 (2주)" },
  { step: 3, text: "기본 규칙 학습 (2개월)" },
  { step: 4, text: "패턴 암기 (1개월)" },
  { step: 5, text: "드디어 실전 시작...?" },
];
const NEW_STEPS = [
  { step: 1, text: "바로 써먹는\n핵심 조각 (1주)" },
  { step: 2, text: "내가 원하는 결과를 만드는\n확장 공식 (3주)" },
  { step: 3, text: "실전에 바로 적용하는\n케이스 스터디 (4주)" },
];

// ── 3) 조각 1개로 무한 확장: 설명 이미지 + 애니메이션 카드 ────────────────────
function SolutionImage({ url }: { url: string }) {
  const { ref, inView } = useInView(0);
  return (
    <div ref={ref} style={{ opacity: inView ? 1 : 0, transform: inView ? "translateY(0)" : "translateY(40px)", transition: "opacity 0.6s ease, transform 0.6s ease" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="조각 학습법 설명" style={{ width: "100%", height: "auto", display: "block" }} loading="lazy" />
    </div>
  );
}

function ReadyReveal({ children }: { children: React.ReactNode }) {
  const { ref, inView } = useInView(0);
  return (
    <div ref={ref} style={{ opacity: inView ? 1 : 0, transform: inView ? "translateY(0)" : "translateY(30px)", transition: "opacity 0.6s ease, transform 0.6s ease" }}>
      {children}
    </div>
  );
}

const FORMULA_SETS = [
  { piece1: "기초", piece1kr: "핵심 조각", piece2: "실전 케이스", piece2kr: "적용 연습", result: "기초+실전 케이스", resultKr: "바로 적용 가능" },
  { piece1: "질문", piece1kr: "핵심 조각", piece2: "답변 패턴", piece2kr: "적용 연습", result: "질문+답변 패턴", resultKr: "바로 대응 가능" },
  { piece1: "상황", piece1kr: "핵심 조각", piece2: "대응 공식", piece2kr: "적용 연습", result: "상황+대응 공식", resultKr: "바로 해결 가능" },
];

function FormulaAnimation() {
  const [setIdx, setSetIdx] = useState(0);
  const [phase, setPhase] = useState(0); // 0,1: 조합 단계, 2: 결과 단계
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const cycle = () => {
      setPhase(0);
      timers.push(setTimeout(() => setPhase(1), 1200));
      timers.push(setTimeout(() => setPhase(2), 2200));
      timers.push(
        setTimeout(() => {
          setSetIdx((i) => (i + 1) % FORMULA_SETS.length);
          setPhase(0);
        }, 4200),
      );
    };
    cycle();
    const interval = setInterval(cycle, 4200);
    return () => {
      clearInterval(interval);
      timers.forEach(clearTimeout);
    };
  }, []);
  const { ref, inView } = useInView();
  const a = FORMULA_SETS[setIdx];

  return (
    <div
      ref={ref}
      style={{
        marginTop: 32,
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(40px)",
        transition: "opacity 0.6s ease, transform 0.6s ease",
      }}
    >
      <div style={{ borderRadius: 24, overflow: "hidden", boxShadow: "0 10px 30px rgba(82,68,212,0.15)", border: `1px solid ${ACCENT}33`, background: `linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT2} 100%)` }}>
        <div style={{ padding: "16px 24px", textAlign: "center" }}>
          <p style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>핵심 조각 1개로 무한 확장 ✨</p>
        </div>
        <div style={{ background: "#2A2A2A", margin: 12, borderRadius: 18, padding: "32px 20px" }}>
          <div style={{ position: "relative", minHeight: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {phase <= 1 && (
              <div style={{ textAlign: "center", width: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 16 }}>
                  <div style={{ background: "#3D3D3D", borderRadius: 12, padding: "12px 20px", border: "1px solid #555", transform: phase === 1 ? "translateX(10px)" : "translateX(0)", transition: "transform 0.5s ease" }}>
                    <span style={{ color: "#fff", fontWeight: 700, fontSize: 22 }}>{a.piece1}</span>
                  </div>
                  <span style={{ color: "#999", fontSize: 20, opacity: phase === 1 ? 0 : 1, transition: "opacity 0.3s" }}>+</span>
                  <div style={{ background: "#3D3D3D", borderRadius: 12, padding: "12px 20px", border: "1px solid #555", transform: phase === 1 ? "translateX(-10px)" : "translateX(0)", transition: "transform 0.5s ease" }}>
                    <span style={{ color: "#fff", fontWeight: 700, fontSize: 22 }}>{a.piece2}</span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 40 }}>
                  <span style={{ color: ACCENT3, fontSize: 14, fontWeight: 500 }}>{a.piece1kr}</span>
                  <span style={{ color: ACCENT3, fontSize: 14, fontWeight: 500 }}>{a.piece2kr}</span>
                </div>
              </div>
            )}
            {phase === 2 && (
              <div style={{ textAlign: "center", width: "100%" }}>
                <div style={{ display: "inline-block", background: ACCENT, borderRadius: 16, padding: "16px 32px", marginBottom: 12 }}>
                  <span style={{ color: "#fff", fontWeight: 800, fontSize: 26 }}>{a.result}</span>
                </div>
                <p style={{ color: ACCENT3, fontSize: 16, fontWeight: 500 }}>{a.resultKr}</p>
              </div>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 24 }}>
            {FORMULA_SETS.map((_, i) => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: 999, background: i === setIdx ? ACCENT : "#555", transition: "background 0.3s" }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 4) 조각 3개 캐러셀(react-slick 대체: 가운데 카드 강조 + 자동 슬라이드) ──
interface PieceExample {
  title: string;
  examples: { jp: string; ko: string }[];
  tip: string;
}
const PIECES: PieceExample[] = [
  {
    title: "오네가이시마스 (부탁합니다)",
    examples: [
      { jp: "스시 오네가이시마스", ko: "스시 주세요" },
      { jp: "메뉴 오네가이시마스", ko: "메뉴판 주세요" },
      { jp: "오카이케이 오네가이시마스", ko: "계산이요" },
    ],
    tip: "일본인들이 쿠다사이보다 실제로 훨씬 많이 쓰는 표현!",
  },
  {
    title: "이쿠라데스카 (얼마예요?)",
    examples: [
      { jp: "코레 이쿠라데스카", ko: "이거 얼마예요?" },
      { jp: "젠부데 이쿠라데스카", ko: "전부 얼마예요?" },
    ],
    tip: "쇼핑할 때 이것만 알면 끝!",
  },
  {
    title: "시마스 (합니다)",
    examples: [
      { jp: "료리 시마스", ko: "요리합니다" },
      { jp: "벤쿄 시마스", ko: "공부합니다" },
      { jp: "쥰비 시마스", ko: "준비합니다" },
    ],
    tip: "앞에만 바꾸면 뭐든 말할 수 있어요",
  },
];

function PiecesCarousel() {
  const [idx, setIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function restart() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setIdx((i) => (i + 1) % PIECES.length), 4000);
  }
  useEffect(() => {
    restart();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function go(i: number) {
    setIdx((i + PIECES.length) % PIECES.length);
    restart();
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
        {[-1, 0, 1].map((offset) => {
          const i = (idx + offset + PIECES.length) % PIECES.length;
          const p = PIECES[i];
          const isCenter = offset === 0;
          return (
            <div
              key={`${i}-${offset}`}
              onClick={() => !isCenter && go(i)}
              style={{
                cursor: isCenter ? "default" : "pointer",
                flex: isCenter ? "0 0 70%" : "0 0 15%",
                opacity: isCenter ? 1 : 0.4,
                transform: isCenter ? "scale(1)" : "scale(0.85)",
                transition: "all 0.4s ease",
                display: offset === 0 ? "block" : "none",
              }}
              className="pieces-slide-visible"
            >
              <div style={{ background: "#fff", borderRadius: 24, padding: "48px", boxShadow: "0 20px 50px rgba(0,0,0,0.15)", minHeight: 400, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <h3 style={{ fontSize: 30, fontWeight: 700, color: ACCENT, marginBottom: 32, paddingBottom: 16, borderBottom: "1px solid #eee" }}>{p.title}</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                    {p.examples.map((ex) => (
                      <div key={ex.jp} style={{ fontSize: 16 }}>
                        <span style={{ fontWeight: 700, color: "#333", marginRight: 8 }}>• {ex.jp}</span>
                        <span style={{ color: "#888" }}>→ {ex.ko}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ background: "#FFF9C4", padding: 16, borderRadius: 12, display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 22 }}>💡</span>
                  <p style={{ color: "#7a5c00", fontSize: 14, fontWeight: 700, paddingTop: 2 }}>{p.tip}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 24 }}>
        {PIECES.map((_, i) => (
          <button
            key={i}
            onClick={() => go(i)}
            aria-label={`${i + 1}번째 예시 보기`}
            style={{ width: i === idx ? 24 : 10, height: 10, borderRadius: i === idx ? 6 : 999, background: i === idx ? "#fff" : "rgba(255,255,255,0.4)", border: "none", cursor: "pointer", transition: "all 0.3s" }}
          />
        ))}
      </div>
    </div>
  );
}

// ── 5) 60일의 기적: 무한 가로 스크롤 marquee ────────────────────────────────
const MIRACLE_CARDS = [
  { key: "effect-travel", title: "여행", desc: "번역기 없이 주문하고\n현지인이랑 대화해요" },
  { key: "effect-content", title: "콘텐츠", desc: "애니, 드라마\n자막 없이 봐요" },
  { key: "effect-career", title: "커리어", desc: "일본 회사 취업,\n통역 알바도 가능해요" },
  { key: "effect-package", title: "패키지 구성", desc: "스탠다드/프리미엄\n나에게 맞는 선택" },
];

function MiracleMarquee({ images }: { images: LandingImage[] | null }) {
  const cards = [...MIRACLE_CARDS, ...MIRACLE_CARDS];
  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <style>{`
        @keyframes coursesMarqueeScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .courses-marquee-track {
          animation: coursesMarqueeScroll 18s linear infinite;
        }
        .courses-marquee-track:hover {
          animation-play-state: paused;
        }
      `}</style>
      <div className="courses-marquee-track" style={{ display: "flex", gap: 24, width: "max-content" }}>
        {cards.map((card, i) => {
          const url = getLandingImage(images, card.key);
          return (
            <div key={i} style={{ flexShrink: 0, width: 320, background: "#fff", borderRadius: 24, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}>
              <div style={{ height: 192, overflow: "hidden", background: "#eee" }}>
                {url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={card.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                )}
              </div>
              <div style={{ padding: 24 }}>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: "#333", marginBottom: 12 }}>{card.title}</h3>
                <p style={{ color: "#666", whiteSpace: "pre-line", lineHeight: 1.6 }}>{card.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 6) 후기: 무한 가로 스크롤 marquee ───────────────────────────────────────
const REVIEWS = [
  { text: "조각 문장으로 배우니까 훨씬 이해가 빨랐어요. 여행 가서 진짜 잘 써먹었습니다!", name: "moch_kn" },
  { text: "문법 공부만 하다가 지쳤었는데, 조각 일본어는 바로 말이 나와서 신기했어요.", name: "seon" },
  { text: "일본 여행 가서 자유롭게 대화하니까 너무 뿌듯했어요. 강추합니다 ❤️", name: "pyeom" },
  { text: "짧은 기간에 이렇게 늘 줄 몰랐어요. 커리큘럼이 정말 실용적입니다.", name: "희진맘" },
];

function ReviewsMarquee() {
  const items = [...REVIEWS, ...REVIEWS];
  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <style>{`
        @keyframes coursesReviewScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .courses-review-track {
          animation: coursesReviewScroll 24s linear infinite;
        }
        .courses-review-track:hover {
          animation-play-state: paused;
        }
      `}</style>
      <div className="courses-review-track" style={{ display: "flex", gap: 20, width: "max-content" }}>
        {items.map((r, i) => (
          <div key={i} style={{ flexShrink: 0, width: 300, background: "#fff", borderRadius: 20, padding: 28, border: "1px solid #eee", boxShadow: "0 2px 10px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", gap: 4, marginBottom: 12, color: ACCENT3 }}>★★★★★</div>
            <p style={{ color: "#444", fontSize: 15, lineHeight: 1.6, marginBottom: 20 }}>&quot;{r.text}&quot;</p>
            <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 16, borderTop: "1px solid #f2f2f2" }}>
              <div style={{ width: 36, height: 36, borderRadius: 999, background: ACCENT_SOFT, display: "flex", alignItems: "center", justifyContent: "center", color: ACCENT, fontWeight: 700 }}>
                {r.name[0]}
              </div>
              <span style={{ fontWeight: 700, color: "#333", fontSize: 14 }}>{r.name}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 7) 커리큘럼 로드맵 (60일의 기적과 후기 사이, barojp id="curriculum") ─────
const CURRICULUM_KEYS = ["curriculum-1", "curriculum-2", "curriculum-3"];

function CurriculumImage({ url, alt }: { url: string; alt: string }) {
  // 커리큘럼 이미지는 세로로 매우 길어(최대 5000px대) threshold 비율 기준
  // IntersectionObserver가 뷰포트를 다 채워도 트리거되지 않는 경우가 있어
  // threshold를 0으로 낮춘다(1px이라도 보이면 즉시 리빌).
  const { ref, inView } = useInView(0);
  if (!url) return null;
  return (
    <div ref={ref} style={{ opacity: inView ? 1 : 0, transform: inView ? "translateY(0)" : "translateY(40px)", transition: "opacity 0.6s ease, transform 0.6s ease" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} style={{ width: "100%", height: "auto", display: "block" }} loading="lazy" />
    </div>
  );
}

function CurriculumSection({ images }: { images: LandingImage[] | null }) {
  return (
    <section id="curriculum" style={{ background: NAVY, padding: "64px 0 96px" }}>
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "0 20px", display: "flex", flexDirection: "column", gap: 0 }}>
        {CURRICULUM_KEYS.map((key, i) => (
          <CurriculumImage key={key} url={getLandingImage(images, key)} alt={`60일 완성 로드맵 - ${i + 1}`} />
        ))}
      </div>
    </section>
  );
}

// ── 8-1) 플로팅 버튼(카카오톡 상담 + 맨 위로, barojp: scrollY > 500) ────────
const KAKAO_CHANNEL_URL = "http://pf.kakao.com/_xoxhxchX";

function FloatingButtons() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 500);
    window.addEventListener("scroll", onScroll);
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <div style={{ position: "fixed", bottom: 112, right: 24, zIndex: 40, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-end" }}>
      <a
        href={KAKAO_CHANNEL_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="카카오톡 상담"
        style={{
          width: 48,
          height: 48,
          background: "#FEE500",
          borderRadius: 999,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#3C1E1E",
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" aria-hidden="true">
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
        </svg>
      </a>
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="맨 위로"
        style={{
          width: 48,
          height: 48,
          background: "#fff",
          borderRadius: 999,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          border: "1px solid #eee",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#374151",
          cursor: "pointer",
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m5 12 7-7 7 7" />
          <path d="M12 19V5" />
        </svg>
      </button>
    </div>
  );
}

// ── 8-2) 하단 고정 신청 바 (barojp: scrollY > 600에서 슬라이드 인) ─────────────
function StickyApplyBar() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    window.addEventListener("scroll", onScroll);
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: "rgba(26,26,26,0.95)",
        backdropFilter: "blur(8px)",
        borderTop: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.2)",
        transform: visible ? "translateY(0)" : "translateY(100%)",
        opacity: visible ? 1 : 0,
        transition: "transform 0.3s ease, opacity 0.3s ease",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <span style={{ color: "#fff", fontWeight: 500 }} className="sticky-apply-label">지금 바로 시작하세요!</span>
        <Link
          href="/courses/apply"
          style={{
            background: ACCENT,
            color: "#fff",
            fontWeight: 700,
            fontSize: 18,
            padding: "12px 40px",
            borderRadius: 999,
            textDecoration: "none",
            boxShadow: `0 10px 20px ${ACCENT}33`,
            whiteSpace: "nowrap",
          }}
        >
          강의 신청하기
        </Link>
      </div>
      <style>{`
        @media (max-width: 767px) {
          .sticky-apply-label { display: none; }
        }
      `}</style>
    </div>
  );
}

export function CoursesLandingPageClient() {
  const imagesQuery = useQuery({
    queryKey: ["landing-images"],
    queryFn: fetchLandingImages,
    staleTime: 5 * 60 * 1000,
  });
  const images = imagesQuery.data ?? null;
  const { profile: headerProfile, handleLogout } = useHeaderAuth();

  const logoLight = getLandingImage(images, "logo-light");
  const logoDark = getLandingImage(images, "logo-dark");
  const heroMain = getLandingImage(images, "hero-main");

  const compareReveal = useInView();
  const needReveal = useInView();

  return (
    <div style={{ fontFamily: "Pretendard, ui-sans-serif, system-ui, sans-serif", color: "#111", background: "#fff" }}>
      {/* Header */}
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
          <nav style={{ display: "flex", alignItems: "center", gap: 4 }} className="apply-nav">
            <Link href="/courses" style={{ padding: "8px 16px", borderRadius: 999, fontSize: 18, fontWeight: 700, color: ACCENT, background: ACCENT_SOFT, textDecoration: "none" }}>
              강의실 소개
            </Link>
            <Link href="/courses/webinar" style={{ padding: "8px 16px", borderRadius: 999, fontSize: 18, fontWeight: 500, color: "#333", textDecoration: "none" }}>
              무료웨비나
            </Link>
            <Link href="/courses/apply" style={{ padding: "8px 16px", borderRadius: 999, fontSize: 18, fontWeight: 500, color: "#333", textDecoration: "none" }}>
              수강신청
            </Link>
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <HeaderBell profile={headerProfile} />
            <Link
              href="/courses/my"
              style={{ padding: "8px 20px", borderRadius: 999, background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT3})`, color: "#fff", fontWeight: 700, fontSize: 18, textDecoration: "none" }}
            >
              내 강의실
            </Link>
            <HeaderAuthArea profile={headerProfile} handleLogout={handleLogout} />
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section style={{ width: "100%", paddingTop: 16, background: "#fff" }}>
          {heroMain && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroMain} alt="강의실 소개" style={{ width: "100%", height: "auto", display: "block" }} />
          )}
          <div style={{ width: "100%", background: "#1a1a1a", padding: "40px 0 56px", textAlign: "center" }}>
            <p style={{ color: ACCENT3, fontSize: 16, fontWeight: 700, letterSpacing: 0.3, marginBottom: 8 }}>기초부터 실전까지..?</p>
            <h2 style={{ color: "#fff", fontSize: 30, fontWeight: 800, letterSpacing: -0.3 }}>강의에 필요한것만 속성으로 배우세요!</h2>
          </div>
        </section>

        {/* 우리에게 필요한건 */}
        <section style={{ width: "100%", background: "#F6F5FF", padding: "64px 0 96px" }}>
          <div ref={needReveal.ref} style={{ maxWidth: 900, margin: "0 auto", padding: "0 20px", textAlign: "center", opacity: needReveal.inView ? 1 : 0, transform: needReveal.inView ? "translateY(0)" : "translateY(24px)", transition: "opacity 0.6s ease, transform 0.6s ease" }}>
            <p style={{ color: ACCENT, fontSize: 18, fontWeight: 700, marginBottom: 12 }}>기초부터 실전까지..</p>
            <h2 style={{ color: NAVY, fontSize: 48, fontWeight: 800, lineHeight: 1.375, marginBottom: 56 }}>
              우리에게 필요한건<br /><span style={{ color: ACCENT }}>제대로 된 실전 강의</span> 입니다.
            </h2>
            <div style={{ position: "relative", width: "100%", maxWidth: 780, margin: "0 auto", aspectRatio: "16/9", borderRadius: 24, overflow: "hidden", background: "#000", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
              ▶ 소개영상
            </div>
          </div>
        </section>

        {/* 고민 카드 */}
        <section style={{ padding: "80px 0 96px", background: "#fff" }}>
          <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 20px" }}>
            <div style={{ textAlign: "center", marginBottom: 64 }}>
              <h2 style={{ fontSize: 48, fontWeight: 800, color: "#111", marginBottom: 12, lineHeight: 1 }}>지금 어떤 고민이 있으신가요?</h2>
              <p style={{ color: "#6b7280", fontSize: 18 }}>
                해당되는 고민을 <span style={{ fontWeight: 700, color: "#111" }}>확인해보세요.</span>
              </p>
            </div>
            <WorryCards />
            <div style={{ textAlign: "center", marginTop: 56 }}>
              <p style={{ fontSize: 24, fontWeight: 700, color: "#1f2937", lineHeight: 1.5 }}>
                <span style={{ color: ACCENT }}>90%가 제대로 된 실전 연습 없이</span> 이론만 공부했기 때문입니다
              </p>
            </div>
          </div>
        </section>

        {/* 비교 섹션 */}
        <section style={{ padding: "80px 0 112px", background: NAVY }}>
          <div ref={compareReveal.ref} style={{ maxWidth: 900, margin: "0 auto", padding: "0 20px", opacity: compareReveal.inView ? 1 : 0, transform: compareReveal.inView ? "translateY(0)" : "translateY(24px)", transition: "opacity 0.6s ease, transform 0.6s ease" }}>
            <h2 style={{ textAlign: "center", fontSize: 48, fontWeight: 800, color: "#fff", marginBottom: 64, lineHeight: 1.25 }}>
              <span style={{ color: ACCENT3 }}>왜</span> 열심히 해도<br />안 될까요?
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 32, alignItems: "stretch" }} className="compare-flex-row">
              {/* 왼쪽: 독학 */}
              <div style={{ flex: 1, borderRadius: 28, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <div style={{ background: "#1E2A38", padding: "28px 36px", flex: 1 }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#2A3645", borderRadius: 12, padding: "12px 20px", marginBottom: 32 }}>
                    <span style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>독학 / 이론 공부법</span>
                    <span style={{ fontSize: 24 }}>✍️</span>
                  </div>
                  <div style={{ position: "relative", paddingLeft: 20 }}>
                    <div style={{ position: "absolute", left: 7, top: 8, bottom: 8, width: 2, background: "#4a5568" }} />
                    {OLD_STEPS.map((s, i) => (
                      <div key={s.step} style={{ position: "relative", paddingLeft: 28, paddingBottom: i < OLD_STEPS.length - 1 ? 24 : 0 }}>
                        <div style={{ position: "absolute", left: 0, top: 6, width: 16, height: 16, borderRadius: 999, background: "#6b7280", border: `2px solid #1E2A38` }} />
                        <p style={{ color: "#8b93a3", fontSize: 12, fontWeight: 800, letterSpacing: 0.5, marginBottom: 2 }}>STEP {s.step}</p>
                        <p style={{ color: "#fff", fontSize: 20, fontWeight: 700, lineHeight: 1.38 }}>{s.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ background: "#0F1820", padding: "28px 36px", textAlign: "center" }}>
                  <span style={{ display: "inline-block", background: "#4a5568", color: "#fff", fontSize: 12, fontWeight: 700, padding: "4px 16px", borderRadius: 999, marginBottom: 12 }}>결과</span>
                  <p style={{ color: "#8b93a3", fontSize: 14, marginBottom: 8 }}>6개월 지나도 실전에서 못 써먹음</p>
                  <p style={{ color: "#fff", fontSize: 20, fontWeight: 800, lineHeight: 1.6, marginBottom: 20 }}>
                    &quot; 머릿속에 지식은 있는데<br />막상 적용이 안 돼요 &quot;
                  </p>
                  <div style={{ position: "relative", display: "inline-block" }}>
                    <span style={{ fontSize: 72 }}>🤔</span>
                    <div style={{ position: "absolute", top: -8, left: -30, background: "#2A3645", color: "#c3cad4", fontSize: 10, fontFamily: "monospace", padding: "4px 8px", borderRadius: 8 }}>이론</div>
                    <div style={{ position: "absolute", top: -16, right: -30, background: "#2A3645", color: "#c3cad4", fontSize: 10, fontFamily: "monospace", padding: "4px 8px", borderRadius: 8 }}>암기</div>
                    <div style={{ position: "absolute", bottom: 8, left: -36, background: "#2A3645", color: "#c3cad4", fontSize: 10, fontFamily: "monospace", padding: "4px 8px", borderRadius: 8 }}>패턴</div>
                    <div style={{ position: "absolute", bottom: 0, right: -20, background: "#2A3645", color: "#c3cad4", fontSize: 10, fontFamily: "monospace", padding: "4px 8px", borderRadius: 8 }}>공식</div>
                  </div>
                </div>
              </div>

              {/* 오른쪽: 코치픽 */}
              <div style={{ flex: 1, borderRadius: 28, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: `0 0 40px ${ACCENT}26` }}>
                <div style={{ background: ACCENT, padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                  <span style={{ color: "#fff", fontWeight: 800, fontSize: 20 }}>코치픽 실전 강의</span>
                  <span style={{ fontSize: 22 }}>🎯</span>
                </div>
                <div style={{ background: "#fff", padding: "28px 36px", flex: 1 }}>
                  <div style={{ position: "relative", paddingLeft: 20 }}>
                    <div style={{ position: "absolute", left: 7, top: 8, bottom: 8, width: 0, borderLeft: `2px dashed ${ACCENT_SOFT}` }} />
                    {NEW_STEPS.map((s, i) => (
                      <div key={s.step} style={{ position: "relative", paddingLeft: 28, paddingBottom: i < NEW_STEPS.length - 1 ? 32 : 0 }}>
                        <div style={{ position: "absolute", left: 0, top: 6, width: 16, height: 16, borderRadius: 999, background: ACCENT, border: "2px solid #fff", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
                        <p style={{ color: ACCENT, fontSize: 12, fontWeight: 800, letterSpacing: 0.5, marginBottom: 3 }}>STEP {s.step}</p>
                        <p style={{ color: NAVY, fontSize: 20, fontWeight: 700, lineHeight: 1.38, whiteSpace: "pre-line" }}>{s.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ background: ACCENT_SOFT, padding: "28px 36px", textAlign: "center" }}>
                  <span style={{ display: "inline-block", background: ACCENT, color: "#fff", fontSize: 12, fontWeight: 700, padding: "4px 16px", borderRadius: 999, marginBottom: 12 }}>결과</span>
                  <p style={{ color: ACCENT, fontSize: 14, fontWeight: 500, marginBottom: 8 }}>2달 만에 실전 감각 마스터</p>
                  <p style={{ color: NAVY, fontSize: 20, fontWeight: 800, lineHeight: 1.6, marginBottom: 20 }}>&quot; 생각 없이 바로 적용이 돼요 &quot;</p>
                  <div style={{ position: "relative", display: "inline-block" }}>
                    <span style={{ fontSize: 72 }}>💁‍♀️</span>
                    <div style={{ position: "absolute", top: -4, right: -80, background: "#fff", color: ACCENT, fontSize: 10, fontWeight: 700, padding: "6px 10px", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.15)", whiteSpace: "nowrap" }}>바로 적용돼요</div>
                    <div style={{ position: "absolute", bottom: 4, left: -80, background: "#fff", color: ACCENT, fontSize: 10, fontWeight: 700, padding: "6px 10px", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.15)", whiteSpace: "nowrap" }}>바로 이해돼요</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 조각 1개로 무한 확장: 설명 이미지 + 애니메이션 카드 + 마무리 문구 */}
        <section style={{ padding: "80px 0", background: "#fff" }}>
          <div style={{ maxWidth: 500, margin: "0 auto", padding: "0 20px" }}>
            {["solution-1", "solution-2", "solution-3"].map((key) => {
              const url = getLandingImage(images, key);
              return url ? <SolutionImage key={key} url={url} /> : null;
            })}
            <FormulaAnimation />
            <ReadyReveal>
              <p style={{ textAlign: "center", color: "#222", fontSize: 20, fontWeight: 700, lineHeight: 1.6, marginTop: 40 }}>
                강의도 마찬가지로<br />핵심 조각을 조합하는 연습을 하면<br /><span style={{ color: ACCENT }}>자연스럽게 실전 감각이 트입니다</span>
              </p>
            </ReadyReveal>
          </div>
        </section>

        {/* 조각 3개 캐러셀 */}
        <section style={{ padding: "96px 0", background: `linear-gradient(135deg, ${ACCENT2}, ${ACCENT3})`, overflow: "hidden" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 20px" }}>
            <div style={{ textAlign: "center", marginBottom: 64, color: "#fff" }}>
              <h2 style={{ fontSize: 48, fontWeight: 700, marginBottom: 24, lineHeight: 1.25 }}>
                이 조각 3개만 알아도<br />수백 가지 상황에 대응할 수 있습니다
              </h2>
              <p style={{ fontSize: 20, fontWeight: 500, opacity: 0.9, maxWidth: 640, margin: "0 auto", lineHeight: 1.6 }}>
                필수 조각들만 골라 배워보세요.<br />실전 감각, 60일이면 충분히 마스터할 수 있습니다.
              </p>
            </div>
            <PiecesCarousel />
            <div style={{ marginTop: 48, textAlign: "center" }}>
              <p style={{ color: "#fff", fontWeight: 800, fontSize: 22, marginBottom: 8 }}>조각만 알면 수백 가지 상황을 자유자재로!</p>
              <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 16 }}>코치픽과 함께라면, 당신의 실전 감각이 놀랍도록 풍성해집니다.</p>
            </div>
          </div>
        </section>

        {/* 60일의 기적 (무한 마퀴) */}
        <section style={{ padding: "96px 0", background: "#F9F9F9", overflow: "hidden" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 20px", marginBottom: 56, textAlign: "center" }}>
            <span style={{ display: "block", color: ACCENT, fontWeight: 700, fontSize: 20, marginBottom: 16 }}>60일의 기적</span>
            <h2 style={{ fontSize: 48, fontWeight: 700, color: "#111", lineHeight: 1.25 }}>
              코치픽 60일 과정을 마스터한<br />2달 후, 당신의 달라진 모습
            </h2>
          </div>
          <MiracleMarquee images={images} />
        </section>

        {/* 커리큘럼 로드맵 (barojp id="curriculum") */}
        <CurriculumSection images={images} />

        {/* 후기 (무한 마퀴) */}
        <section style={{ padding: "64px 0 96px", background: "#fff", overflow: "hidden" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 20px", marginBottom: 48 }}>
            <h2 style={{ fontSize: 48, fontWeight: 700, textAlign: "center", color: "#111" }}>먼저 경험한 수강생들의 이야기</h2>
          </div>
          <ReviewsMarquee />
        </section>

        {/* 최종 CTA */}
        <section style={{ padding: "96px 0", background: ACCENT, color: "#fff", textAlign: "center" }}>
          <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 20px" }}>
            <h2 style={{ fontSize: 48, fontWeight: 700, marginBottom: 24, lineHeight: 1.25 }}>
              2달 만에 실전 감각을 익힌 당신,<br />상상이 되시나요?
            </h2>
            <p style={{ fontSize: 20, opacity: 0.9, marginBottom: 48 }}>
              지금까지 배웠던 방식이랑은 180도 다른<br />직접 적용하면서 배우는 코치픽을 경험하세요!
            </p>
            <Link
              href="/courses/apply"
              style={{ display: "inline-block", background: "#fff", color: ACCENT, fontSize: 24, fontWeight: 700, padding: "20px 64px", borderRadius: 999, boxShadow: "0 10px 30px rgba(0,0,0,0.15)", textDecoration: "none" }}
            >
              🎯 지금 바로 시작하기
            </Link>
          </div>
        </section>
      </main>

      <footer style={{ background: "#111", color: "#6b7280", padding: "64px 0", fontSize: 14 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 20px" }}>
          <div style={{ marginBottom: 32 }}>
            <div style={{ marginBottom: 24 }}>
              {logoDark ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoDark} alt="강의실" style={{ height: 56, width: "auto", objectFit: "contain", filter: "brightness(0) invert(1)" }} />
              ) : (
                <span style={{ color: "#fff", fontWeight: 800, fontSize: 20 }}>코치픽</span>
              )}
            </div>
            <div style={{ lineHeight: 1.6 }}>
              <p style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 12 }}>코치픽</p>
              <p style={{ marginBottom: 4 }}>대표 : 코치픽 대표 | 사업자등록번호 : 000-00-00000</p>
              <p style={{ marginBottom: 4 }}>고객센터 : support@coachpick.example</p>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", borderTop: "1px solid #262626", paddingTop: 32, gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 24 }}>
              <Link href="/terms" style={{ color: "#6b7280" }}>이용약관</Link>
              <Link href="/privacy" style={{ color: "#6b7280" }}>개인정보처리방침</Link>
              <Link href="/refund" style={{ color: "#6b7280" }}>환불규정</Link>
            </div>
            <div>
              <Link href="/courses/my" style={{ color: "#4b5563", fontSize: 12 }}>내 강의실</Link>
            </div>
          </div>
          <div style={{ textAlign: "center", color: "#4b5563", marginTop: 32, paddingTop: 24, borderTop: "1px solid #262626" }}>
            Copyright (c) 코치픽 All Rights Reserved.
          </div>
        </div>
      </footer>

      <FloatingButtons />
      <StickyApplyBar />

      <style>{`
        @media (min-width: 768px) {
          .compare-flex-row {
            flex-direction: row !important;
          }
        }
      `}</style>
    </div>
  );
}
