"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchLandingImages, type LandingImage } from "@/lib/api";
import { HeaderAuthArea, HeaderBell, useHeaderAuth } from "@/components/course-site/CourseSiteHeaderAuth";

/** https://auctioncoachp.imweb.me/ (자사 무료 세미나 랜딩페이지)의 헤더 아래
 * 본문 콘텐츠를 그대로 가져온 페이지. 헤더는 코치픽 강의실 공통 헤더를 쓴다. */

const ACCENT = "#5244d4";
const ACCENT_LIGHT = "#8b7cf8";
const ACCENT_SOFT = "#EFECFF";

// 원본 상세 이미지 40장 (imweb CDN, 순서 그대로)
const DETAIL_IMAGES: string[] = [
  "https://cdn.imweb.me/thumbnail/20260114/00e9c62c87e7d.gif",
  "https://cdn.imweb.me/thumbnail/20260114/0a028b069a863.png",
  "https://cdn.imweb.me/thumbnail/20260113/effdfd89d0842.png",
  "https://cdn.imweb.me/thumbnail/20260113/fb0b04776ab7c.gif",
  "https://cdn.imweb.me/thumbnail/20260113/ea33d3db99554.png",
  "https://cdn.imweb.me/thumbnail/20260114/d5daf1a56258d.gif",
  "https://cdn.imweb.me/thumbnail/20260114/69c6631cb2a69.gif",
  "https://cdn.imweb.me/thumbnail/20260114/39c282d3e1f3b.png",
  "https://cdn.imweb.me/thumbnail/20260113/f933f7ff8e834.gif",
  "https://cdn.imweb.me/thumbnail/20260114/7d551470fc4d7.png",
  "https://cdn.imweb.me/thumbnail/20260113/2f7687acdcf8b.gif",
  "https://cdn.imweb.me/thumbnail/20260714/0fbefe740a544.gif",
  "https://cdn.imweb.me/thumbnail/20260113/2d5756319949c.png",
  "https://cdn.imweb.me/thumbnail/20260113/7a534feafc602.png",
  "https://cdn.imweb.me/thumbnail/20260113/b805f2ec5038d.png",
  "https://cdn.imweb.me/thumbnail/20260114/491217edeec6c.png",
  "https://cdn.imweb.me/thumbnail/20260114/d5a9630f7957c.png",
  "https://cdn.imweb.me/thumbnail/20260113/e55289f080118.png",
  "https://cdn.imweb.me/thumbnail/20260113/1e0e7eb8092bd.png",
  "https://cdn.imweb.me/thumbnail/20260113/8f0034742d1c4.png",
  "https://cdn.imweb.me/thumbnail/20260113/e0bb4ef9546b5.png",
  "https://cdn.imweb.me/thumbnail/20260114/cb390fb6c5937.png",
  "https://cdn.imweb.me/thumbnail/20260114/1e87929a77b71.png",
  "https://cdn.imweb.me/thumbnail/20260113/67535ff325137.gif",
  "https://cdn.imweb.me/thumbnail/20260714/f73adaa17e22e.gif",
  "https://cdn.imweb.me/thumbnail/20260113/47a20cbfc6eda.png",
  "https://cdn.imweb.me/thumbnail/20260113/d1f308b610c00.gif",
  "https://cdn.imweb.me/thumbnail/20260113/2d8085a446e92.png",
  "https://cdn.imweb.me/thumbnail/20260113/6ed1b6557a22c.png",
  "https://cdn.imweb.me/thumbnail/20260113/bc725cf242ccd.png",
  "https://cdn.imweb.me/thumbnail/20260125/cf666bc0bb566.png",
  "https://cdn.imweb.me/thumbnail/20260125/6679d3dd87f47.png",
  "https://cdn.imweb.me/thumbnail/20260125/f067a27fbbb5b.png",
  "https://cdn.imweb.me/thumbnail/20260714/a64d1c0210f15.png",
  "https://cdn.imweb.me/thumbnail/20260714/d4c2ec3f6ba4f.png",
  "https://cdn.imweb.me/thumbnail/20260714/46b294e5804b1.png",
  "https://cdn.imweb.me/thumbnail/20260113/8b143982a7be4.png",
  "https://cdn.imweb.me/thumbnail/20260113/550af29a0eb74.png",
  "https://cdn.imweb.me/thumbnail/20260113/3fb18de6b2099.png",
  "https://cdn.imweb.me/thumbnail/20260113/e04cd05cd88f1.png",
];

const YOUTUBE_VIDEO_ID = "q2XlKRjna7s";

// 하단 고정 신청 바 (/courses 강의실 소개 페이지의 것과 동일한 구조, 버튼만
// "무료 웨비나 신청"으로 바꾸고 실제 수강신청 페이지로 연결한다)
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
          href="/courses/webinar/join"
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
          무료 웨비나 신청
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

export function WebinarPageClient() {
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
      {/* Header (코치픽 강의실 공통 헤더) */}
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
            <Link href="/courses/webinar" style={{ padding: "8px 16px", borderRadius: 999, fontSize: 18, fontWeight: 700, color: ACCENT, background: ACCENT_SOFT, textDecoration: "none" }}>
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
              style={{ padding: "8px 20px", borderRadius: 999, background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_LIGHT})`, color: "#fff", fontWeight: 700, fontSize: 18, textDecoration: "none" }}
            >
              내 강의실
            </Link>
            <HeaderAuthArea profile={headerProfile} handleLogout={handleLogout} />
          </div>
        </div>
      </header>

      {/* 본문: auctioncoachp.imweb.me 헤더 아래 콘텐츠 그대로 */}
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px 96px" }}>
        {/* 최상단 히어로 이미지 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://cdn.imweb.me/thumbnail/20260708/5565febf4fb70.png"
          alt=""
          style={{ width: "100%", height: "auto", display: "block", marginBottom: 24 }}
        />

        {/* 히어로 문구 */}
        <p style={{ fontSize: 30, fontWeight: 700, color: "#111", textAlign: "center", marginBottom: 24, lineHeight: 1.4 }}>
          하루 1시간 2천만원으로 7000만원 버는 부동산 경매 노하우
        </p>

        {/* 가격 정보: 원본과 동일하게 2열(라벨 좌측 / 값 우측정렬) x 2행 */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 30, color: "#C11212" }}>무료</span>
            <strong style={{ fontSize: 30 }}>0원</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 4 }}>
            <strong>총 결제금액</strong>
            <strong>0</strong>
          </div>
        </div>

        {/* 유튜브 영상 */}
        <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", borderRadius: 16, overflow: "hidden", marginBottom: 24, background: "#000" }}>
          <iframe
            src={`https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?rel=0`}
            title="경매코치 무료 세미나 소개 영상"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>

        {/* 영상 아래 이미지 2장 */}
        <div style={{ marginBottom: 40 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://cdn.imweb.me/thumbnail/20260213/5b9f21c259ee7.gif"
            alt=""
            style={{ width: "100%", maxWidth: 438, height: "auto", display: "block", margin: "0 auto" }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://cdn.imweb.me/thumbnail/20260114/a7f5d5bd0a45e.gif"
            alt=""
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        </div>

        {/* 상세 이미지 (원본 40장 그대로 세로 나열) */}
        <div>
          {DETAIL_IMAGES.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt="" style={{ width: "100%", height: "auto", display: "block" }} loading={i < 2 ? "eager" : "lazy"} />
          ))}
        </div>

        {/* 신청 버튼: 카카오 로그인 또는 이메일 가입 선택 화면으로 이동 */}
        <div style={{ textAlign: "center", marginTop: 40, marginBottom: 40 }}>
          <Link
            href="/courses/webinar/join"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "16px 48px",
              borderRadius: 8,
              background: ACCENT,
              color: "#fff",
              fontWeight: 700,
              fontSize: 18,
              textDecoration: "none",
            }}
          >
            무료 웨비나 신청하기
          </Link>
        </div>
      </main>

      <StickyApplyBar />
    </div>
  );
}
