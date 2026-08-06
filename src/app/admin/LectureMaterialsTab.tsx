"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchLectureSlides,
  updateLectureSlide,
  uploadLectureImage,
  type LectureFieldLayout,
  type LectureImagePlacement,
  type LectureSlide,
} from "@/lib/api";

const DECKS: { id: string; label: string }[] = [
  { id: "webinar-final", label: "최종본 웨비나 (1~115페이지)" },
  { id: "webinar-2607", label: "강의자료 (24페이지)" },
];

/** 원본 슬라이드가 G마켓산스로 제작됐다(PPT-HTML-복원-규칙.md). 편집기 캔버스가
 *  이 폰트를 안 쓰면 브라우저 기본 폰트로 렌더링되어 실제보다 글자 폭이 넓어지고,
 *  고정 배치된 이미지와 텍스트가 겹치는 문제가 있었다(2026-07-24).
 *  이전에 외부 CDN(jsdelivr GitHub 프록시, webfontworld/gmarket)에서 불러왔는데
 *  그 저장소가 사라져 404가 나면서 폰트가 전혀 적용되지 않았다 — 그래서 Medium
 *  파일(npm @noonnu/gmarket-sans-medium 배포본)을 public/fonts에 직접 받아
 *  자체 호스팅한다. Bold 웹폰트는 신뢰할 수 있는 배포처를 찾지 못해, 대신
 *  브라우저 합성 굵게(font-synthesis: weight)로 근사 처리한다. */
const SLIDE_FONT_FAMILY = "LectureSlideGmarketSans";
const SLIDE_FONT_CSS = `
@font-face {
  font-family: '${SLIDE_FONT_FAMILY}';
  src: url('/fonts/GmarketSansMedium.woff') format('woff');
  font-weight: 500;
}
`;

/** 원본 슬라이드는 1920x1080. 캔버스는 이 배율로 축소해서 보여준다. */
const CANVAS_WIDTH = 720;
const SCALE = CANVAS_WIDTH / 1920;
const CANVAS_HEIGHT = 1080 * SCALE;

const WHITE = "#ffffff";
const BLUE = "#1D49B9";
const BLACK = "#17191C";
const YELLOW_BG = "#FFF176";
const ORANGE = "#FC5230";
const YELLOW_BG2 = "#F5E541";

/** 필드 텍스트에 줄바꿈(&lt;br&gt;)만 허용해 렌더링한다. 관리자 전용 도구이지만
 *  innerHTML을 쓰는 이상 다른 태그가 섞여 들어가는 걸 막아둔다. */
function escapeHtmlWithBr(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(/&lt;br&gt;/g, "<br>").replace(/\n/g, "<br>");
}

/** 헤더가 있는 슬라이드 공통: 파란 배너 + "경매를 찾아서" 류 타이틀.
 *  헤더 자체는 텍스트 편집 대상에 포함하지 않고(제목 슬라이드 구분용 고정 요소로 취급),
 *  headerTitle 필드로만 문구를 바꿀 수 있게 한다. */
function headerField(label = "헤더 문구", fontSize = 77): {
  key: string;
  label: string;
  defaultLayout: LectureFieldLayout;
} {
  return {
    key: "headerTitle",
    label,
    defaultLayout: { top: 76, left: 80, fontSize, color: WHITE, fontWeight: 700, textAlign: "left" },
  };
}

/** 그룹 구분자. 원본 슬라이드에서 "30대 <강조>50억 자산</강조> 달성"처럼
 *  한 줄에 색/굵기가 다른 텍스트 조각이 섞여 있는 경우, 각 조각을 절대좌표로
 *  따로 배치하면 텍스트 길이가 바뀔 때마다 서로 겹친다(실제로 겹침 버그가
 *  발생했다, 2026-07-24). 이를 막기 위해 key를 "그룹키::조각키"로 인코딩해
 *  같은 그룹의 조각들을 하나의 flex row로 묶어 자동 순서 배치한다 — 조각들은
 *  top/textAlign을 공유(그룹 대표 = 첫 조각)하고, 조각별로는 글자색/굵기/
 *  배경색만 다르게 지정할 수 있다. */
const GROUP_SEP = "::";

function groupKeyOf(fieldKey: string): string {
  return fieldKey.includes(GROUP_SEP) ? fieldKey.split(GROUP_SEP)[0] : fieldKey;
}

function groupField(
  group: string,
  part: string,
  label: string,
  defaultLayout: LectureFieldLayout,
): { key: string; label: string; defaultLayout: LectureFieldLayout } {
  return { key: `${group}${GROUP_SEP}${part}`, label, defaultLayout };
}

/** 슬라이드 id별 고정 배경 이미지(위치/크기 고정, 텍스트만 편집 가능).
 *  좌표는 원본 HTML 복원 작업(PPT-HTML-복원-규칙.md) 실측값 그대로. */
const SLIDE_IMAGES: Record<
  string,
  { src: string; top: number; left: number; width: number }[]
> = {
  "webinar-2607_slide-01": [{ src: "/lecture-materials/icon_logo_t.png", top: 130, left: 812, width: 296 }],
  "webinar-2607_slide-02": [{ src: "/lecture-materials/icon_dokdok_t.png", top: 218, left: 148, width: 432 }],
  "webinar-2607_slide-03": [{ src: "/lecture-materials/icon_heart_finger_t.png", top: 345, left: 1520, width: 270 }],
  "webinar-2607_slide-10": [{ src: "/lecture-materials/img_p10_youtube.png", top: 242, left: 0, width: 1920 }],
  "webinar-2607_slide-12": [{ src: "/lecture-materials/img_p12_apt.png", top: 326, left: 1042, width: 838 }],
  "webinar-2607_slide-13": [{ src: "/lecture-materials/img_p13_chart.png", top: 320, left: 1023, width: 797 }],
  "webinar-2607_slide-14": [{ src: "/lecture-materials/img_p14_char_t.png", top: -200, left: 1100, width: 900 }],
  "webinar-2607_slide-16": [
    { src: "/lecture-materials/img_p16_villa.png", top: 323, left: 50, width: 530 },
    { src: "/lecture-materials/img_p16_dagagu.png", top: 323, left: 839, width: 676 },
    { src: "/lecture-materials/img_p16_apt.png", top: 636, left: 307, width: 607 },
    { src: "/lecture-materials/img_p16_factory.png", top: 636, left: 1177, width: 693 },
  ],
  "webinar-2607_slide-19": [{ src: "/lecture-materials/img_p19_info.png", top: 358, left: 742, width: 1178 }],
  "webinar-2607_slide-20": [{ src: "/lecture-materials/img_p20_info.png", top: 310, left: 1098, width: 769 }],
  "webinar-2607_slide-21": [{ src: "/lecture-materials/img_p21_info.png", top: 254, left: 1066, width: 854 }],
  "webinar-2607_slide-23": [
    { src: "/lecture-materials/img_p23_man_t.png", top: 600, left: 100, width: 432 },
    { src: "/lecture-materials/img_p23_woman_t.png", top: 600, left: 1520, width: 432 },
  ],
  "webinar-final_slide-04": [{ src: "/lecture-materials/icon_logo_t.png", top: 141, left: 812, width: 228 }],
  "webinar-final_slide-05": [{ src: "/lecture-materials/icon_dokdok_t.png", top: 218, left: 148, width: 432 }],
  "webinar-final_slide-06": [{ src: "/lecture-materials/icon_heart_finger_t.png", top: 345, left: 1520, width: 270 }],
  "webinar-final_slide-11": [{ src: "/lecture-materials/img_p11_ebook.png", top: 339, left: 63, width: 815 }],
  "webinar-final_slide-12": [{ src: "/lecture-materials/img_p12_playcard.png", top: 480, left: 158, width: 410 }],
  "webinar-final_slide-13": [{ src: "/lecture-materials/img_p13_excel.png", top: 413, left: 160, width: 432 }],
  "webinar-final_slide-14": [{ src: "/lecture-materials/img_p14_kakao.png", top: 487, left: 250, width: 346 }],
  "webinar-final_slide-15": [{ src: "/lecture-materials/img_p15_chicken.png", top: 540, left: 589, width: 738 }],
  "webinar-final_slide-17": [{ src: "/lecture-materials/img_p17_youtube.png", top: 242, left: 0, width: 1920 }],
  "webinar-final_slide-18": [
    { src: "/lecture-materials/img_p18_atm.png", top: 551, left: 370, width: 603 },
    { src: "/lecture-materials/img_p18_chip.png", top: 550, left: 1015, width: 499 },
  ],
  "webinar-final_slide-23": [{ src: "/lecture-materials/s23_apartment.png", top: 295, left: 57, width: 930 }],
  "webinar-final_slide-24": [{ src: "/lecture-materials/s24_photo.png", top: 290, left: 1055, width: 790 }],
  "webinar-final_slide-26": [{ src: "/lecture-materials/s26_chart.png", top: 80, left: 30, width: 880 }],
  "webinar-final_slide-29": [{ src: "/lecture-materials/s29_apartment.png", top: 295, left: 940, width: 940 }],
  "webinar-final_slide-30": [{ src: "/lecture-materials/s30_chart.png", top: 290, left: 940, width: 900 }],
  "webinar-final_slide-31": [{ src: "/lecture-materials/s31_character.png", top: 255, left: 1330, width: 540 }],
  "webinar-final_slide-34": [
    { src: "/lecture-materials/s34_villa.png", top: 300, left: 60, width: 530 },
    { src: "/lecture-materials/s34_apt.png", top: 635, left: 300, width: 630 },
    { src: "/lecture-materials/s34_multi.png", top: 300, left: 980, width: 780 },
    { src: "/lecture-materials/s34_factory.png", top: 635, left: 1220, width: 790 },
  ],
  "webinar-final_slide-41": [
    { src: "/lecture-materials/s41_photo1.png", top: 590, left: 230, width: 390 },
    { src: "/lecture-materials/s41_photo2.png", top: 590, left: 678, width: 390 },
  ],
  "webinar-final_slide-42": [
    { src: "/lecture-materials/s42_photo1.png", top: 590, left: 225, width: 390 },
    { src: "/lecture-materials/s42_photo2.png", top: 590, left: 673, width: 390 },
  ],
  "webinar-final_slide-43": [{ src: "/lecture-materials/s43_photo.png", top: 255, left: 38, width: 1010 }],
  "webinar-final_slide-44": [{ src: "/lecture-materials/s44_photo.png", top: 290, left: 38, width: 1075 }],
  "webinar-final_slide-45": [{ src: "/lecture-materials/s45_photo.png", top: 290, left: 38, width: 830 }],
  "webinar-final_slide-106": [{ src: "/lecture-materials/s162.png", top: 84, left: 1061, width: 706 }],
  "webinar-final_slide-107": [
    { src: "/lecture-materials/s163.png", top: 654, left: 39, width: 1068 },
    { src: "/lecture-materials/s164.png", top: 784, left: 615, width: 380 },
    { src: "/lecture-materials/s165.png", top: 207, left: 39, width: 1068 },
    { src: "/lecture-materials/s166.png", top: 554, left: 919, width: 142 },
  ],
  "webinar-final_slide-108": [
    { src: "/lecture-materials/s167.png", top: 464, left: 10, width: 1200 },
    { src: "/lecture-materials/s168.png", top: 421, left: 1185, width: 416 },
    { src: "/lecture-materials/s169.png", top: 431, left: 1244, width: 98 },
    { src: "/lecture-materials/s170.png", top: 421, left: 1532, width: 388 },
    { src: "/lecture-materials/s169.png", top: 426, left: 1588, width: 98 },
    { src: "/lecture-materials/s171.png", top: 741, left: 713, width: 44 },
  ],
  "webinar-final_slide-109": [
    { src: "/lecture-materials/s172.png", top: 911, left: 1210, width: 374 },
    { src: "/lecture-materials/s173.png", top: 971, left: 1165, width: 39 },
    { src: "/lecture-materials/s173.png", top: 965, left: 1177, width: 39 },
    { src: "/lecture-materials/s173.png", top: 972, left: 1189, width: 39 },
    { src: "/lecture-materials/s173.png", top: 956, left: 1199, width: 39 },
    { src: "/lecture-materials/s173.png", top: 964, left: 1212, width: 39 },
    { src: "/lecture-materials/s173.png", top: 949, left: 1224, width: 39 },
    { src: "/lecture-materials/s174.png", top: 971, left: 1603, width: 39 },
    { src: "/lecture-materials/s174.png", top: 977, left: 1591, width: 39 },
    { src: "/lecture-materials/s174.png", top: 970, left: 1579, width: 39 },
    { src: "/lecture-materials/s174.png", top: 988, left: 1569, width: 39 },
    { src: "/lecture-materials/s174.png", top: 981, left: 1557, width: 39 },
    { src: "/lecture-materials/s174.png", top: 985, left: 1546, width: 39 },
    { src: "/lecture-materials/s175.png", top: 899, left: 1543, width: 55 },
    { src: "/lecture-materials/s176.png", top: 878, left: 636, width: 397 },
    { src: "/lecture-materials/s177.png", top: 878, left: 598, width: 41 },
    { src: "/lecture-materials/s177.png", top: 876, left: 612, width: 41 },
    { src: "/lecture-materials/s177.png", top: 887, left: 622, width: 41 },
    { src: "/lecture-materials/s177.png", top: 874, left: 637, width: 41 },
    { src: "/lecture-materials/s177.png", top: 885, left: 647, width: 41 },
    { src: "/lecture-materials/s177.png", top: 874, left: 664, width: 41 },
    { src: "/lecture-materials/s178.png", top: 1010, left: 1043, width: 41 },
    { src: "/lecture-materials/s178.png", top: 1012, left: 1029, width: 41 },
    { src: "/lecture-materials/s178.png", top: 1001, left: 1019, width: 41 },
    { src: "/lecture-materials/s178.png", top: 1016, left: 1004, width: 41 },
    { src: "/lecture-materials/s178.png", top: 1005, left: 993, width: 41 },
    { src: "/lecture-materials/s178.png", top: 1007, left: 980, width: 41 },
    { src: "/lecture-materials/s179.png", top: 920, left: 1003, width: 58 },
    { src: "/lecture-materials/s180.png", top: 221, left: 80, width: 417 },
  ],
  "webinar-final_slide-110": [
    { src: "/lecture-materials/s181.png", top: 321, left: 1004, width: 874 },
    { src: "/lecture-materials/s182.png", top: 500, left: 1026, width: 827 },
    { src: "/lecture-materials/s183.png", top: 317, left: 48, width: 912 },
    { src: "/lecture-materials/s184.png", top: 492, left: 115, width: 791 },
  ],
  "webinar-final_slide-111": [
    { src: "/lecture-materials/s185.png", top: 326, left: 152, width: 385 },
    { src: "/lecture-materials/s186.png", top: 337, left: 160, width: 62 },
    { src: "/lecture-materials/s187.png", top: 326, left: 673, width: 428 },
    { src: "/lecture-materials/s188.png", top: 326, left: 1237, width: 597 },
  ],
  "webinar-final_slide-112": [
    { src: "/lecture-materials/s189.png", top: 550, left: 680, width: 221 },
  ],
  "webinar-final_slide-113": [
    { src: "/lecture-materials/s161.png", top: 323, left: 100, width: 419 },
  ],
  "webinar-final_slide-114": [
    { src: "/lecture-materials/s190.png", top: 259, left: 314, width: 718 },
    { src: "/lecture-materials/s191.png", top: 259, left: 1032, width: 647 },
  ],
};

/** 슬라이드 id별 편집 가능 필드와 기본 레이아웃(DB에 layout이 없을 때 사용).
 *  좌표/폰트크기는 원본 HTML 복원 작업(PPT-HTML-복원-규칙.md) 실측값 그대로. */
const SLIDE_FIELD_DEFS: Record<
  string,
  { key: string; label: string; defaultLayout: LectureFieldLayout }[]
> = {
  "webinar-2607_slide-01": [
    { key: "titleLine1", label: "제목 1줄", defaultLayout: { top: 425, left: 0, fontSize: 139, color: WHITE, fontWeight: 700, textAlign: "center" } },
    { key: "titleLine2", label: "제목 2줄", defaultLayout: { top: 564, left: 0, fontSize: 139, color: WHITE, fontWeight: 700, textAlign: "center" } },
    { key: "subtitle", label: "부제목", defaultLayout: { top: 940, left: 0, fontSize: 28, color: WHITE, fontWeight: 500, textAlign: "center" } },
  ],
  "webinar-2607_slide-02": [
    { key: "line1", label: "1줄 (잘)", defaultLayout: { top: 255, left: 1045, fontSize: 150, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "line2", label: "2줄 (들리시나요??)", defaultLayout: { top: 415, left: 596, fontSize: 150, color: BLUE, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-2607_slide-03": [
    { key: "title", label: "본문", defaultLayout: { top: 280, left: 62, fontSize: 181, color: BLUE, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-2607_slide-04": [
    groupField("line", "normalText", "일반 텍스트", { top: 492, left: 216, fontSize: 89, color: BLACK, fontWeight: 500, textAlign: "left" }),
    groupField("line", "emphasisText", "강조 텍스트", { top: 492, left: 0, fontSize: 147, color: BLUE, fontWeight: 700, textAlign: "left" }),
  ],
  "webinar-2607_slide-05": [
    groupField("line", "prefix", "앞 텍스트", { top: 498, left: 118, fontSize: 108, color: BLACK, fontWeight: 500, textAlign: "left" }),
    groupField("line", "emphasisText", "강조 텍스트", { top: 498, left: 0, fontSize: 108, color: BLUE, fontWeight: 700, textAlign: "left" }),
    groupField("line", "suffix", "뒤 텍스트", { top: 498, left: 0, fontSize: 108, color: BLACK, fontWeight: 500, textAlign: "left" }),
  ],
  "webinar-2607_slide-06": [
    groupField("line", "prefix", "앞 텍스트", { top: 498, left: 168, fontSize: 109, color: BLACK, fontWeight: 500, textAlign: "left" }),
    groupField("line", "emphasisText", "강조 텍스트", { top: 498, left: 0, fontSize: 109, color: BLUE, fontWeight: 700, textAlign: "left" }),
    groupField("line", "suffix", "뒤 텍스트", { top: 498, left: 0, fontSize: 109, color: BLACK, fontWeight: 500, textAlign: "left" }),
  ],
  "webinar-2607_slide-07": [
    groupField("line", "prefix", "앞 텍스트", { top: 497, left: 163, fontSize: 108, color: BLACK, fontWeight: 500, textAlign: "left" }),
    groupField("line", "emphasisText", "강조 텍스트", { top: 497, left: 0, fontSize: 108, color: BLUE, fontWeight: 700, textAlign: "left" }),
    groupField("line", "suffix", "뒤 텍스트", { top: 497, left: 0, fontSize: 108, color: BLACK, fontWeight: 500, textAlign: "left" }),
  ],
  "webinar-2607_slide-08": [
    { key: "normalText", label: "일반 텍스트", defaultLayout: { top: 355, left: 0, fontSize: 86, color: BLACK, fontWeight: 500, textAlign: "center" } },
    { key: "emphasisText", label: "강조 텍스트", defaultLayout: { top: 520, left: 0, fontSize: 153, color: BLUE, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-2607_slide-09": [
    { key: "greeting", label: "인사말", defaultLayout: { top: 325, left: 0, fontSize: 163, color: BLUE, fontWeight: 700, textAlign: "center" } },
    { key: "normalText", label: "일반 텍스트", defaultLayout: { top: 578, left: 400, fontSize: 158, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "emphasisText", label: "강조 텍스트", defaultLayout: { top: 578, left: 1200, fontSize: 158, color: BLUE, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-2607_slide-10": [
    { key: "title", label: "제목", defaultLayout: { top: 77, left: 80, fontSize: 77, color: WHITE, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-2607_slide-11": [
    { key: "line1", label: "1줄", defaultLayout: { top: 282, left: 0, fontSize: 128, color: BLUE, fontWeight: 700, textAlign: "center" } },
    { key: "tilde", label: "물결(~)", defaultLayout: { top: 521, left: 0, fontSize: 60, color: BLUE, fontWeight: 700, textAlign: "center" } },
    { key: "line2", label: "2줄", defaultLayout: { top: 675, left: 0, fontSize: 131, color: BLUE, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-2607_slide-12": [
    headerField(),
    { key: "yearBig", label: "연도", defaultLayout: { top: 312, left: 199, fontSize: 116, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "yearBig2", label: "부제(부동산 시작)", defaultLayout: { top: 492, left: 121, fontSize: 118, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "line1", label: "본문 1줄", defaultLayout: { top: 674, left: 164, fontSize: 88, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "line2", label: "본문 2줄", defaultLayout: { top: 792, left: 163, fontSize: 88, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "highlight", label: "강조(노란줄)", defaultLayout: { top: 910, left: 163, fontSize: 88, color: BLACK, fontWeight: 700, textAlign: "left", backgroundColor: YELLOW_BG } },
  ],
  "webinar-2607_slide-13": [
    headerField(),
    { key: "line1", label: "본문 1줄", defaultLayout: { top: 320, left: 102, fontSize: 88, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "line2", label: "본문 2줄", defaultLayout: { top: 490, left: 102, fontSize: 88, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "highlight", label: "강조(노란줄)", defaultLayout: { top: 788, left: 98, fontSize: 120, color: BLACK, fontWeight: 700, textAlign: "left", backgroundColor: YELLOW_BG } },
  ],
  "webinar-2607_slide-14": [
    { key: "normalText", label: "일반 텍스트", defaultLayout: { top: 264, left: 263, fontSize: 100, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "emphasisText", label: "강조 텍스트", defaultLayout: { top: 504, left: 157, fontSize: 100, color: BLUE, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-2607_slide-15": [
    headerField(),
    { key: "subtitle", label: "부제목", defaultLayout: { top: 312, left: 0, fontSize: 107, color: BLACK, fontWeight: 500, textAlign: "center" } },
    { key: "title", label: "제목", defaultLayout: { top: 507, left: 0, fontSize: 192, color: BLACK, fontWeight: 700, textAlign: "center" } },
    { key: "highlight", label: "강조(노란줄)", defaultLayout: { top: 810, left: 0, fontSize: 176, color: BLACK, fontWeight: 700, textAlign: "center", backgroundColor: YELLOW_BG } },
  ],
  "webinar-2607_slide-16": [
    headerField("헤더 문구", 77),
    { key: "label1", label: "라벨1(빌라)", defaultLayout: { top: 248, left: 248, fontSize: 72, color: WHITE, fontWeight: 700, textAlign: "left" } },
    { key: "label2", label: "라벨2(아파트)", defaultLayout: { top: 540, left: 613, fontSize: 72, color: WHITE, fontWeight: 700, textAlign: "left" } },
    { key: "label3", label: "라벨3(다가구)", defaultLayout: { top: 248, left: 1005, fontSize: 72, color: WHITE, fontWeight: 700, textAlign: "left" } },
    { key: "label4", label: "라벨4(공장)", defaultLayout: { top: 537, left: 1560, fontSize: 72, color: WHITE, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-2607_slide-17": [
    headerField(),
    { key: "subtitle", label: "부제목", defaultLayout: { top: 349, left: 0, fontSize: 104, color: BLACK, fontWeight: 500, textAlign: "center" } },
    { key: "detail", label: "상세", defaultLayout: { top: 502, left: 0, fontSize: 98, color: BLACK, fontWeight: 500, textAlign: "center" } },
    groupField("line", "prefix", "앞(30대)", { top: 757, left: 0, fontSize: 198, color: BLACK, fontWeight: 700, textAlign: "center" }),
    groupField("line", "highlight", "강조(노란줄)", { top: 757, left: 0, fontSize: 198, color: BLACK, fontWeight: 700, textAlign: "center", backgroundColor: YELLOW_BG }),
    groupField("line", "suffix", "뒤(달성)", { top: 757, left: 0, fontSize: 198, color: BLACK, fontWeight: 700, textAlign: "center" }),
  ],
  "webinar-2607_slide-18": [
    headerField(),
    { key: "subtitle", label: "부제목", defaultLayout: { top: 326, left: 0, fontSize: 100, color: BLACK, fontWeight: 500, textAlign: "center" } },
    { key: "detail", label: "상세", defaultLayout: { top: 479, left: 0, fontSize: 98, color: BLACK, fontWeight: 500, textAlign: "center" } },
    groupField("line", "highlight", "강조(노란줄)", { top: 755, left: 0, fontSize: 193, color: BLACK, fontWeight: 700, textAlign: "center", backgroundColor: YELLOW_BG }),
    groupField("line", "suffix", "뒤(수익 달성!)", { top: 755, left: 0, fontSize: 193, color: BLACK, fontWeight: 700, textAlign: "center" }),
  ],
  "webinar-2607_slide-19": [
    headerField("헤더 문구", 78),
    { key: "subtitle", label: "부제목", defaultLayout: { top: 458, left: 198, fontSize: 88, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "highlight", label: "강조", defaultLayout: { top: 643, left: 58, fontSize: 136, color: BLUE, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-2607_slide-20": [
    headerField("헤더 문구", 78),
    { key: "line1", label: "본문 1줄", defaultLayout: { top: 370, left: 271, fontSize: 78, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "line2", label: "본문 2줄", defaultLayout: { top: 466, left: 272, fontSize: 78, color: BLACK, fontWeight: 500, textAlign: "left" } },
    groupField("line", "highlight", "강조(3억)", { top: 726, left: 111, fontSize: 200, color: BLACK, fontWeight: 700, textAlign: "left", backgroundColor: YELLOW_BG }),
    groupField("line", "suffix", "뒤(차익)", { top: 726, left: 0, fontSize: 200, color: BLACK, fontWeight: 700, textAlign: "left" }),
  ],
  "webinar-2607_slide-21": [
    headerField("헤더 문구", 78),
    { key: "line1", label: "본문 1줄", defaultLayout: { top: 319, left: 220, fontSize: 78, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "line2", label: "본문 2줄", defaultLayout: { top: 439, left: 220, fontSize: 78, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "line3", label: "본문 3줄", defaultLayout: { top: 547, left: 220, fontSize: 78, color: BLACK, fontWeight: 500, textAlign: "left" } },
    groupField("line", "highlight", "강조(1.1억)", { top: 716, left: 111, fontSize: 170, color: BLACK, fontWeight: 700, textAlign: "left", backgroundColor: YELLOW_BG }),
    groupField("line", "suffix", "뒤(차익)", { top: 716, left: 0, fontSize: 170, color: BLACK, fontWeight: 700, textAlign: "left" }),
  ],
  "webinar-2607_slide-22": [
    headerField("헤더 문구", 78),
    { key: "normalText", label: "일반 텍스트", defaultLayout: { top: 391, left: 0, fontSize: 88, color: BLACK, fontWeight: 500, textAlign: "center" } },
    { key: "highlight1", label: "강조1(매년 2건)", defaultLayout: { top: 545, left: 0, fontSize: 100, color: BLUE, fontWeight: 700, textAlign: "center" } },
    { key: "highlight2", label: "강조2(전업 투자자 전향)", defaultLayout: { top: 717, left: 0, fontSize: 100, color: BLUE, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-2607_slide-23": [
    headerField("헤더 문구", 77),
    { key: "line1", label: "본문 1줄", defaultLayout: { top: 341, left: 0, fontSize: 88, color: BLACK, fontWeight: 700, textAlign: "center" } },
    { key: "line2", label: "본문 2줄", defaultLayout: { top: 662, left: 0, fontSize: 88, color: BLACK, fontWeight: 700, textAlign: "center" } },
    { key: "line3", label: "본문 3줄", defaultLayout: { top: 829, left: 0, fontSize: 88, color: BLACK, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-2607_slide-24": [
    groupField("line1", "prefix", "1줄 앞(1번)", { top: 354, left: 484, fontSize: 100, color: "#12887A", fontWeight: 700, textAlign: "left" }),
    groupField("line1", "middle", "1줄 중간", { top: 354, left: 0, fontSize: 100, color: BLACK, fontWeight: 700, textAlign: "left" }),
    groupField("line1", "suffix", "1줄 뒤(있다)", { top: 354, left: 0, fontSize: 100, color: "#12887A", fontWeight: 700, textAlign: "left" }),
    groupField("line2", "prefix", "2줄 앞(2번)", { top: 577, left: 517, fontSize: 100, color: "#FC5230", fontWeight: 700, textAlign: "left" }),
    groupField("line2", "middle", "2줄 중간", { top: 577, left: 0, fontSize: 100, color: BLACK, fontWeight: 700, textAlign: "left" }),
    groupField("line2", "suffix", "2줄 뒤(없다)", { top: 577, left: 0, fontSize: 100, color: "#FC5230", fontWeight: 700, textAlign: "left" }),
  ],
  "webinar-final_slide-01": [
    headerField("헤더 문구", 88),
    { key: "title", label: "제목", defaultLayout: { top: 534, left: 0, fontSize: 157, color: "#E60012", fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-02": [
    headerField("헤더 문구", 88),
    { key: "title", label: "제목", defaultLayout: { top: 534, left: 0, fontSize: 157, color: "#E60012", fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-03": [
    headerField("헤더 문구", 88),
    { key: "line1", label: "1줄", defaultLayout: { top: 442, left: 0, fontSize: 150, color: "#E60012", fontWeight: 700, textAlign: "center" } },
    { key: "line2", label: "2줄", defaultLayout: { top: 676, left: 0, fontSize: 150, color: "#E60012", fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-04": [
    { key: "titleLine1", label: "제목 1줄", defaultLayout: { top: 460, left: 0, fontSize: 139, color: WHITE, fontWeight: 700, textAlign: "center" } },
    { key: "titleLine2", label: "제목 2줄", defaultLayout: { top: 599, left: 0, fontSize: 139, color: WHITE, fontWeight: 700, textAlign: "center" } },
    { key: "subtitle", label: "부제목", defaultLayout: { top: 945, left: 0, fontSize: 28, color: WHITE, fontWeight: 500, textAlign: "center" } },
  ],
  "webinar-final_slide-05": [
    { key: "line1", label: "1줄 (잘)", defaultLayout: { top: 270, left: 1045, fontSize: 179, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "line2", label: "2줄 (들리시나요??)", defaultLayout: { top: 550, left: 596, fontSize: 186, color: BLUE, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-06": [
    { key: "title", label: "본문", defaultLayout: { top: 280, left: 62, fontSize: 181, color: BLUE, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-07": [
    { key: "l1", label: "1줄", defaultLayout: { top: 201, left: 0, fontSize: 101, color: BLACK, fontWeight: 500, textAlign: "center" } },
    { key: "l2", label: "2줄(여러분)", defaultLayout: { top: 349, left: 0, fontSize: 138, color: BLUE, fontWeight: 700, textAlign: "center" } },
    { key: "l3prefix", label: "3줄 앞", defaultLayout: { top: 708, left: 610, fontSize: 100, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "l3highlight", label: "3줄 강조(한명)", defaultLayout: { top: 708, left: 900, fontSize: 100, color: ORANGE, fontWeight: 700, textAlign: "left" } },
    { key: "l3suffix", label: "3줄 뒤", defaultLayout: { top: 708, left: 1090, fontSize: 100, color: BLACK, fontWeight: 500, textAlign: "left" } },
  ],
  "webinar-final_slide-08": [
    headerField("헤더 문구", 79),
    { key: "w_eunteo", label: "은퇴?", defaultLayout: { top: 284, left: 611, fontSize: 88, color: "#9A30AE", fontWeight: 500, textAlign: "left" } },
    { key: "w_ppangjib", label: "빵집?", defaultLayout: { top: 311, left: 1656, fontSize: 87, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "w_docsa", label: "의사?", defaultLayout: { top: 350, left: 206, fontSize: 103, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "w_jubu", label: "주부?", defaultLayout: { top: 351, left: 1258, fontSize: 103, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "w_filat", label: "필라테스?", defaultLayout: { top: 437, left: 774, fontSize: 103, color: "#FD8A69", fontWeight: 700, textAlign: "left" } },
    { key: "w_gongmu", label: "공무원?", defaultLayout: { top: 561, left: 314, fontSize: 88, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "w_undong", label: "운동선수?", defaultLayout: { top: 578, left: 1384, fontSize: 89, color: "#12887A", fontWeight: 700, textAlign: "left" } },
    { key: "w_haksaeng", label: "학생?", defaultLayout: { top: 637, left: 707, fontSize: 88, color: "#12887A", fontWeight: 500, textAlign: "left" } },
    { key: "w_gyosu", label: "교수?", defaultLayout: { top: 757, left: 78, fontSize: 88, color: "#9A30AE", fontWeight: 500, textAlign: "left" } },
    { key: "w_daegi", label: "대기업?", defaultLayout: { top: 744, left: 1060, fontSize: 71, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "w_eunhaeng", label: "은행원?", defaultLayout: { top: 808, left: 1546, fontSize: 88, color: "#9A30AE", fontWeight: 700, textAlign: "left" } },
    { key: "w_chwijun", label: "취준생?", defaultLayout: { top: 833, left: 513, fontSize: 103, color: "#FD8A69", fontWeight: 700, textAlign: "left" } },
    { key: "w_cake", label: "케이크?", defaultLayout: { top: 973, left: 916, fontSize: 84, color: BLUE, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-09": [
    groupField("line1", "prefix", "1줄 앞(1번)", { top: 356, left: 0, fontSize: 90, color: "#12887A", fontWeight: 700, textAlign: "center" }),
    groupField("line1", "middle", "1줄 중간", { top: 356, left: 0, fontSize: 90, color: BLACK, fontWeight: 500, textAlign: "center" }),
    groupField("line1", "suffix", "1줄 뒤(있다)", { top: 356, left: 0, fontSize: 90, color: "#12887A", fontWeight: 700, textAlign: "center" }),
    groupField("line2", "prefix", "2줄 앞(2번)", { top: 580, left: 0, fontSize: 90, color: ORANGE, fontWeight: 700, textAlign: "center" }),
    groupField("line2", "middle", "2줄 중간", { top: 580, left: 0, fontSize: 90, color: BLACK, fontWeight: 500, textAlign: "center" }),
    groupField("line2", "suffix", "2줄 뒤(없다)", { top: 580, left: 0, fontSize: 90, color: ORANGE, fontWeight: 700, textAlign: "center" }),
  ],
  "webinar-final_slide-10": [
    groupField("line1", "prefix", "1줄 앞(1번)", { top: 354, left: 0, fontSize: 90, color: "#12887A", fontWeight: 700, textAlign: "center" }),
    groupField("line1", "middle", "1줄 중간", { top: 354, left: 0, fontSize: 90, color: BLACK, fontWeight: 500, textAlign: "center" }),
    groupField("line1", "suffix", "1줄 뒤(있다)", { top: 354, left: 0, fontSize: 90, color: "#12887A", fontWeight: 700, textAlign: "center" }),
    groupField("line2", "prefix", "2줄 앞(2번)", { top: 577, left: 0, fontSize: 90, color: ORANGE, fontWeight: 700, textAlign: "center" }),
    groupField("line2", "middle", "2줄 중간", { top: 577, left: 0, fontSize: 90, color: BLACK, fontWeight: 500, textAlign: "center" }),
    groupField("line2", "suffix", "2줄 뒤(없다)", { top: 577, left: 0, fontSize: 90, color: ORANGE, fontWeight: 700, textAlign: "center" }),
  ],
  "webinar-final_slide-11": [
    headerField("헤더 문구(선물1)", 77),
    { key: "price", label: "가격(강조)", defaultLayout: { top: 280, left: 1110, fontSize: 120, color: BLACK, fontWeight: 700, textAlign: "left", backgroundColor: YELLOW_BG2 } },
    { key: "priceSuffix", label: "상당", defaultLayout: { top: 280, left: 1470, fontSize: 120, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "tag", label: "태그", defaultLayout: { top: 432, left: 947, fontSize: 91, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "l1", label: "1줄", defaultLayout: { top: 662, left: 947, fontSize: 91, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "l2", label: "2줄", defaultLayout: { top: 892, left: 947, fontSize: 91, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "l3", label: "3줄", defaultLayout: { top: 1122, left: 947, fontSize: 91, color: BLACK, fontWeight: 500, textAlign: "left" } },
  ],
  "webinar-final_slide-12": [
    headerField("헤더 문구(선물2)", 77),
    { key: "price", label: "가격(강조)", defaultLayout: { top: 280, left: 1094, fontSize: 120, color: BLACK, fontWeight: 700, textAlign: "left", backgroundColor: YELLOW_BG2 } },
    { key: "priceSuffix", label: "상당", defaultLayout: { top: 280, left: 1450, fontSize: 120, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "tag", label: "태그", defaultLayout: { top: 460, left: 947, fontSize: 60, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "l1", label: "1줄", defaultLayout: { top: 555, left: 947, fontSize: 76, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "l2", label: "2줄", defaultLayout: { top: 660, left: 947, fontSize: 76, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "l3", label: "3줄", defaultLayout: { top: 765, left: 947, fontSize: 76, color: BLACK, fontWeight: 500, textAlign: "left" } },
  ],
  "webinar-final_slide-13": [
    headerField("헤더 문구(선물3)", 77),
    { key: "price", label: "가격(강조)", defaultLayout: { top: 280, left: 1110, fontSize: 120, color: BLACK, fontWeight: 700, textAlign: "left", backgroundColor: YELLOW_BG2 } },
    { key: "priceSuffix", label: "상당", defaultLayout: { top: 280, left: 1470, fontSize: 120, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "tag", label: "태그", defaultLayout: { top: 486, left: 661, fontSize: 70, color: BLACK, fontWeight: 700, textAlign: "left" } },
    groupField("line", "emphasis", "강조(직접만든)", { top: 624, left: 661, fontSize: 70, color: ORANGE, fontWeight: 700, textAlign: "left" }),
    groupField("line", "rest", "본문", { top: 624, left: 0, fontSize: 70, color: BLACK, fontWeight: 700, textAlign: "left" }),
  ],
  "webinar-final_slide-14": [
    headerField("헤더 문구(선물4)", 77),
    { key: "price", label: "가격(강조)", defaultLayout: { top: 280, left: 1097, fontSize: 120, color: BLACK, fontWeight: 700, textAlign: "left", backgroundColor: YELLOW_BG2 } },
    { key: "priceSuffix", label: "상당", defaultLayout: { top: 280, left: 1440, fontSize: 120, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "l1", label: "1줄", defaultLayout: { top: 486, left: 654, fontSize: 70, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "l2", label: "2줄", defaultLayout: { top: 585, left: 661, fontSize: 70, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "l3", label: "3줄", defaultLayout: { top: 684, left: 654, fontSize: 70, color: BLACK, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-15": [
    headerField("헤더 문구", 78),
    { key: "title", label: "제목", defaultLayout: { top: 328, left: 0, fontSize: 167, color: BLUE, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-16": [
    { key: "greeting", label: "인사말", defaultLayout: { top: 334, left: 0, fontSize: 158, color: BLUE, fontWeight: 700, textAlign: "center" } },
    { key: "normalText", label: "일반 텍스트", defaultLayout: { top: 588, left: 400, fontSize: 150, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "emphasisText", label: "강조 텍스트", defaultLayout: { top: 588, left: 1200, fontSize: 150, color: BLUE, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-17": [
    headerField("헤더 문구", 88),
  ],
  "webinar-final_slide-18": [
    headerField("헤더 문구", 88),
    { key: "title", label: "제목", defaultLayout: { top: 319, left: 0, fontSize: 118, color: BLACK, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-19": [
    headerField("헤더 문구", 88),
    { key: "l1", label: "1줄(사실...)", defaultLayout: { top: 340, left: 0, fontSize: 110, color: BLACK, fontWeight: 500, textAlign: "center" } },
    groupField("line2", "emphasis", "2줄 강조(빚더미)", { top: 540, left: 0, fontSize: 110, color: BLUE, fontWeight: 700, textAlign: "center" }),
    groupField("line2", "rest", "2줄(인생)", { top: 540, left: 0, fontSize: 110, color: BLACK, fontWeight: 500, textAlign: "center" }),
    groupField("line3", "prefix", "3줄(학자금 대출)", { top: 733, left: 0, fontSize: 90, color: BLACK, fontWeight: 500, textAlign: "center" }),
    groupField("line3", "emphasis", "3줄 강조(4천만원)", { top: 733, left: 0, fontSize: 90, color: BLUE, fontWeight: 700, textAlign: "center" }),
  ],
  "webinar-final_slide-20": [
    headerField("헤더 문구", 88),
    { key: "l1", label: "1줄(엄청난 현타)", defaultLayout: { top: 348, left: 0, fontSize: 168, color: BLACK, fontWeight: 500, textAlign: "center" } },
    { key: "l2", label: "2줄(결국 퇴사)", defaultLayout: { top: 574, left: 0, fontSize: 136, color: ORANGE, fontWeight: 700, textAlign: "center" } },
    { key: "l3", label: "3줄(새로운 도전!)", defaultLayout: { top: 796, left: 0, fontSize: 155, color: BLACK, fontWeight: 500, textAlign: "center" } },
  ],
  "webinar-final_slide-21": [
    headerField("헤더 문구", 77),
    { key: "line1", label: "1줄(마케팅 사업 성공!)", defaultLayout: { top: 560, left: 0, fontSize: 64, color: BLACK, fontWeight: 700, textAlign: "center" } },
    { key: "line2", label: "2줄(빚 청산=>자산 축적)", defaultLayout: { top: 710, left: 0, fontSize: 88, color: BLUE, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-22": [
    { key: "title", label: "본문(어디에 투자하지?)", defaultLayout: { top: 490, left: 0, fontSize: 96, color: BLUE, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-23": [
    headerField("헤더 문구", 77),
    { key: "label", label: "라벨(첫 투자 계획)", defaultLayout: { top: 290, left: 1105, fontSize: 56, color: BLUE, fontWeight: 500, textAlign: "left" } },
    { key: "title", label: "제목(대치아이파크)", defaultLayout: { top: 370, left: 1105, fontSize: 78, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "l1", label: "1줄(매매 10억)", defaultLayout: { top: 520, left: 1105, fontSize: 64, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "l2", label: "2줄(전세 7억)", defaultLayout: { top: 610, left: 1105, fontSize: 64, color: BLACK, fontWeight: 500, textAlign: "left" } },
    groupField("l3", "prefix", "3줄 앞(투자)", { top: 700, left: 1105, fontSize: 64, color: BLACK, fontWeight: 500, textAlign: "left" }),
    groupField("l3", "highlight", "3줄 강조(3억)", { top: 700, left: 0, fontSize: 64, color: BLACK, fontWeight: 500, textAlign: "left", backgroundColor: YELLOW_BG2 }),
  ],
  "webinar-final_slide-24": [
    headerField("헤더 문구", 77),
    { key: "title", label: "제목(명랑時代)", defaultLayout: { top: 265, left: 70, fontSize: 88, color: BLACK, fontWeight: 700, textAlign: "left" } },
    groupField("l2", "tag", "태그(쌀)", { top: 400, left: 60, fontSize: 52, color: WHITE, fontWeight: 700, textAlign: "left", backgroundColor: "#E5231C" }),
    groupField("l2", "suffix", "뒤(핫도그)", { top: 400, left: 0, fontSize: 88, color: BLACK, fontWeight: 700, textAlign: "left" }),
  ],
  "webinar-final_slide-25": [
    { key: "title", label: "본문(얼마가 되었을까요?)", defaultLayout: { top: 490, left: 0, fontSize: 96, color: BLUE, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-26": [
    { key: "l1", label: "1줄(10억->23억)", defaultLayout: { top: 60, left: 990, fontSize: 78, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "l2", label: "2줄(5년 13억)", defaultLayout: { top: 220, left: 990, fontSize: 80, color: "#E5231C", fontWeight: 700, textAlign: "center" } },
    { key: "l3", label: "3줄(연 2.6억)", defaultLayout: { top: 340, left: 990, fontSize: 56, color: "#E5231C", fontWeight: 500, textAlign: "center" } },
    { key: "l4", label: "4줄(월 2천만원)", defaultLayout: { top: 430, left: 990, fontSize: 56, color: "#E5231C", fontWeight: 500, textAlign: "center" } },
    { key: "l5", label: "5줄(현재 32억)", defaultLayout: { top: 640, left: 990, fontSize: 66, color: BLUE, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-27": [
    { key: "l1", label: "1줄(3억투자)", defaultLayout: { top: 290, left: 0, fontSize: 64, color: BLACK, fontWeight: 500, textAlign: "center" } },
    { key: "l2", label: "2줄(5년 13억)", defaultLayout: { top: 430, left: 0, fontSize: 76, color: BLUE, fontWeight: 700, textAlign: "center" } },
    { key: "l3", label: "3줄(10년 22억)", defaultLayout: { top: 570, left: 0, fontSize: 76, color: BLUE, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-28": [
    groupField("line", "prefix", "앞(답은)", { top: 490, left: 0, fontSize: 96, color: BLUE, fontWeight: 700, textAlign: "center" }),
    groupField("line", "suffix", "뒤(부동산이군)", { top: 490, left: 0, fontSize: 96, color: BLACK, fontWeight: 700, textAlign: "center" }),
  ],
  "webinar-final_slide-29": [
    headerField("헤더 문구", 77),
    { key: "year", label: "연도(2015년)", defaultLayout: { top: 290, left: 110, fontSize: 78, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "sub", label: "부제(부동산 시작)", defaultLayout: { top: 400, left: 110, fontSize: 78, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "l1", label: "1줄(시가: 2.3억)", defaultLayout: { top: 580, left: 110, fontSize: 56, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "l2", label: "2줄(전세: 1.8억)", defaultLayout: { top: 660, left: 110, fontSize: 56, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "highlight", label: "강조(투자금: 5천)", defaultLayout: { top: 760, left: 110, fontSize: 56, color: BLACK, fontWeight: 700, textAlign: "left", backgroundColor: YELLOW_BG2 } },
  ],
  "webinar-final_slide-30": [
    headerField("헤더 문구", 77),
    { key: "l1", label: "1줄(5년 만에 5천 으로)", defaultLayout: { top: 300, left: 60, fontSize: 78, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "highlight", label: "강조(4.5억 수익)", defaultLayout: { top: 650, left: 60, fontSize: 82, color: BLACK, fontWeight: 700, textAlign: "left", backgroundColor: YELLOW_BG2 } },
  ],
  "webinar-final_slide-31": [
    { key: "l1", label: "1줄(답은 부동산이군)", defaultLayout: { top: 290, left: 110, fontSize: 70, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "l2", label: "2줄(경매가 좋다고?)", defaultLayout: { top: 400, left: 110, fontSize: 70, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "caption", label: "말풍선(기웃기웃)", defaultLayout: { top: 840, left: 1345, fontSize: 44, color: BLACK, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-32": [
    headerField("헤더 문구", 77),
    { key: "sub", label: "부제(첫 해에 낙찰 4채)", defaultLayout: { top: 300, left: 0, fontSize: 66, color: BLACK, fontWeight: 500, textAlign: "center" } },
    { key: "title", label: "제목(연간 수익)", defaultLayout: { top: 440, left: 0, fontSize: 86, color: BLACK, fontWeight: 700, textAlign: "center" } },
    { key: "highlight", label: "강조(1.5억)", defaultLayout: { top: 640, left: 0, fontSize: 96, color: BLACK, fontWeight: 700, textAlign: "center", backgroundColor: YELLOW_BG2 } },
  ],
  "webinar-final_slide-33": [
    headerField("헤더 문구", 77),
    { key: "sub", label: "부제(4년동안)", defaultLayout: { top: 295, left: 0, fontSize: 60, color: BLACK, fontWeight: 700, textAlign: "center" } },
    { key: "highlight", label: "강조(40건 낙찰)", defaultLayout: { top: 400, left: 0, fontSize: 120, color: BLACK, fontWeight: 700, textAlign: "center", backgroundColor: YELLOW_BG2 } },
    { key: "note", label: "각주(지인, 수강생 컨설팅 포함)", defaultLayout: { top: 640, left: 0, fontSize: 40, color: BLACK, fontWeight: 500, textAlign: "center" } },
  ],
  "webinar-final_slide-34": [
    headerField("헤더 문구", 77),
    { key: "label1", label: "라벨1(빌라)", defaultLayout: { top: 250, left: 60, fontSize: 44, color: WHITE, fontWeight: 700, textAlign: "left", backgroundColor: BLUE } },
    { key: "label2", label: "라벨2(아파트)", defaultLayout: { top: 590, left: 300, fontSize: 44, color: WHITE, fontWeight: 700, textAlign: "left", backgroundColor: BLUE } },
    { key: "label3", label: "라벨3(다가구(건물))", defaultLayout: { top: 250, left: 980, fontSize: 44, color: WHITE, fontWeight: 700, textAlign: "left", backgroundColor: BLUE } },
    { key: "label4", label: "라벨4(공장(토지))", defaultLayout: { top: 590, left: 1550, fontSize: 44, color: WHITE, fontWeight: 700, textAlign: "left", backgroundColor: BLUE } },
  ],
  "webinar-final_slide-35": [
    headerField("헤더 문구", 77),
    { key: "sub1", label: "부제1(4년차)", defaultLayout: { top: 300, left: 0, fontSize: 52, color: BLACK, fontWeight: 500, textAlign: "center" } },
    { key: "sub2", label: "부제2(다가구/공장/재개발빌라)", defaultLayout: { top: 390, left: 0, fontSize: 52, color: BLACK, fontWeight: 500, textAlign: "center" } },
    groupField("line", "prefix", "앞(30대)", { top: 550, left: 0, fontSize: 100, color: BLACK, fontWeight: 700, textAlign: "center" }),
    groupField("line", "highlight", "강조(50억 자산 달성)", { top: 550, left: 0, fontSize: 100, color: BLACK, fontWeight: 700, textAlign: "center", backgroundColor: YELLOW_BG2 }),
  ],
  "webinar-final_slide-36": [
    { key: "l1", label: "1줄(물론, 저도 처음부터)", defaultLayout: { top: 240, left: 0, fontSize: 78, color: BLACK, fontWeight: 500, textAlign: "center" } },
    groupField("line", "l2a", "2줄 위(성공했던건)", { top: 600, left: 0, fontSize: 78, color: BLACK, fontWeight: 500, textAlign: "center", backgroundColor: YELLOW_BG2 }),
    { key: "l2b", label: "2줄 아래(아니었습니다)", defaultLayout: { top: 670, left: 0, fontSize: 78, color: BLACK, fontWeight: 500, textAlign: "center", backgroundColor: YELLOW_BG2 } },
  ],
  "webinar-final_slide-37": [
    { key: "l1", label: "1줄(수강료만)", defaultLayout: { top: 400, left: 110, fontSize: 70, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "highlight", label: "강조(2000만원)", defaultLayout: { top: 600, left: 110, fontSize: 88, color: BLACK, fontWeight: 700, textAlign: "left", backgroundColor: YELLOW_BG2 } },
  ],
  "webinar-final_slide-38": [
    { key: "banner", label: "하단 배너(6개월동안 패찰)", defaultLayout: { top: 730, left: 0, fontSize: 88, color: WHITE, fontWeight: 700, textAlign: "center", backgroundColor: "#E5231C" } },
  ],
  "webinar-final_slide-39": [
    { key: "l1", label: "1줄(아파트)", defaultLayout: { top: 400, left: 250, fontSize: 88, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "l2", label: "2줄(빌라)", defaultLayout: { top: 400, left: 1360, fontSize: 88, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "title", label: "제목(방향전환)", defaultLayout: { top: 700, left: 0, fontSize: 66, color: BLUE, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-40": [
    { key: "title", label: "본문(낙찰을 받기 시작하였습니다)", defaultLayout: { top: 490, left: 0, fontSize: 92, color: BLUE, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-41": [
    headerField("헤더 문구", 88),
    { key: "addr", label: "주소", defaultLayout: { top: 255, left: 60, fontSize: 30, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "addr2", label: "도로명주소", defaultLayout: { top: 290, left: 60, fontSize: 22, color: "#666666", fontWeight: 500, textAlign: "left" } },
    { key: "info", label: "정보(대지권/건물면적/개시결정)", defaultLayout: { top: 340, left: 60, fontSize: 24, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "party", label: "정보(소유자/채무자/채권자)", defaultLayout: { top: 340, left: 660, fontSize: 24, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "price", label: "정보(감정가/최저가/매각가)", defaultLayout: { top: 340, left: 1400, fontSize: 24, color: BLACK, fontWeight: 500, textAlign: "right" } },
    { key: "table", label: "표(매각기일/결과)", defaultLayout: { top: 590, left: 1105, fontSize: 22, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "summary", label: "요약(낙찰/매도/수익)", defaultLayout: { top: 970, left: 0, fontSize: 56, color: BLACK, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-42": [
    headerField("헤더 문구", 88),
    { key: "addr", label: "주소", defaultLayout: { top: 255, left: 60, fontSize: 30, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "addr2", label: "도로명주소", defaultLayout: { top: 290, left: 60, fontSize: 22, color: "#666666", fontWeight: 500, textAlign: "left" } },
    { key: "info", label: "정보(대지권/건물면적/개시결정)", defaultLayout: { top: 340, left: 60, fontSize: 24, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "party", label: "정보(소유자/채무자/채권자)", defaultLayout: { top: 340, left: 660, fontSize: 24, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "price", label: "정보(감정가/최저가/매각가)", defaultLayout: { top: 340, left: 1400, fontSize: 24, color: BLACK, fontWeight: 500, textAlign: "right" } },
    { key: "table", label: "표(매각기일/결과)", defaultLayout: { top: 590, left: 1105, fontSize: 22, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "summary", label: "요약(낙찰/매도/수익)", defaultLayout: { top: 970, left: 0, fontSize: 56, color: BLACK, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-43": [
    headerField("헤더 문구", 88),
    { key: "table", label: "표(매각기일/결과)", defaultLayout: { top: 255, left: 1105, fontSize: 22, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "summary", label: "요약(낙찰 5억/시세 8억)", defaultLayout: { top: 900, left: 0, fontSize: 56, color: BLACK, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-44": [
    headerField("헤더 문구", 88),
    { key: "table", label: "표(매각기일/결과)", defaultLayout: { top: 255, left: 1150, fontSize: 20, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "summary", label: "요약(시세 15억/낙찰 12억)", defaultLayout: { top: 900, left: 0, fontSize: 56, color: BLACK, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-45": [
    headerField("헤더 문구", 88),
    { key: "caseNo", label: "사건번호", defaultLayout: { top: 250, left: 60, fontSize: 26, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "summary", label: "요약(시세 17억/매수 11억)", defaultLayout: { top: 900, left: 0, fontSize: 56, color: BLACK, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-46": [
    headerField("헤더 문구", 88),
    { key: "title", label: "본문(주변 사람에게도 알려주자!)", defaultLayout: { top: 490, left: 0, fontSize: 80, color: BLUE, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-47": [
    headerField("헤더 문구", 88),
    { key: "body", label: "본문(한 달 만에 낙찰...)", defaultLayout: { top: 420, left: 0, fontSize: 66, color: BLACK, fontWeight: 500, textAlign: "center" } },
  ],
  "webinar-final_slide-48": [
    { key: "caption", label: "캡션(카톡 대화 요약)", defaultLayout: { top: 60, left: 60, fontSize: 22, color: "#dddddd", fontWeight: 500, textAlign: "left" } },
  ],
  "webinar-final_slide-49": [
    { key: "caption", label: "캡션(카톡 대화 요약)", defaultLayout: { top: 60, left: 60, fontSize: 26, color: "#eeeeee", fontWeight: 500, textAlign: "left" } },
  ],
  "webinar-final_slide-50": [
    { key: "title", label: "제목(60대 아버님)", defaultLayout: { top: 70, left: 0, fontSize: 76, color: BLUE, fontWeight: 700, textAlign: "center" } },
    { key: "l1", label: "라벨1(낙찰)", defaultLayout: { top: 250, left: 220, fontSize: 52, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "l2", label: "라벨2(또 낙찰)", defaultLayout: { top: 250, left: 1370, fontSize: 52, color: BLACK, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-51": [
    { key: "l1", label: "왼쪽(50대 아버님/7주 만에/낙찰 성공!)", defaultLayout: { top: 70, left: 200, fontSize: 52, color: BLUE, fontWeight: 700, textAlign: "center" } },
    { key: "l2", label: "오른쪽(30대 직장인/10주 만에/낙찰 성공!)", defaultLayout: { top: 70, left: 1370, fontSize: 52, color: BLUE, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-52": [
    { key: "title", label: "제목(방향의 중요성)", defaultLayout: { top: 250, left: 420, fontSize: 80, color: BLACK, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-53": [
    { key: "title", label: "본문(밀착경매)", defaultLayout: { top: 450, left: 0, fontSize: 100, color: BLUE, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-54": [
    { key: "body", label: "본문(수업시작 후 단 7주!...)", defaultLayout: { top: 60, left: 0, fontSize: 64, color: BLACK, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-55": [
    headerField("헤더 문구", 88),
    { key: "label", label: "라벨(비규제빌라)", defaultLayout: { top: 250, left: 38, fontSize: 44, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "info", label: "정보(시세/낙찰)", defaultLayout: { top: 340, left: 38, fontSize: 36, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "highlight", label: "강조(투자/수익)", defaultLayout: { top: 460, left: 38, fontSize: 46, color: BLACK, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-56": [
    headerField("헤더 문구", 88),
    { key: "label", label: "라벨(비규제빌라(동시))", defaultLayout: { top: 400, left: 38, fontSize: 40, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "highlight", label: "강조(대출/투자/수익)", defaultLayout: { top: 500, left: 38, fontSize: 34, color: BLACK, fontWeight: 500, textAlign: "left" } },
  ],
  "webinar-final_slide-57": [
    headerField("헤더 문구", 88),
    { key: "info", label: "정보(시세/낙찰)", defaultLayout: { top: 255, left: 38, fontSize: 36, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "highlight", label: "강조(투자/수익)", defaultLayout: { top: 375, left: 38, fontSize: 46, color: BLACK, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-58": [
    headerField("헤더 문구", 88),
    { key: "label", label: "라벨(비규제빌라(1주택자))", defaultLayout: { top: 250, left: 38, fontSize: 40, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "info", label: "정보(시세/낙찰)", defaultLayout: { top: 340, left: 38, fontSize: 34, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "highlight", label: "강조(투자/수익)", defaultLayout: { top: 450, left: 38, fontSize: 44, color: BLACK, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-59": [
    headerField("헤더 문구", 88),
    { key: "label", label: "라벨(비규제아파트)", defaultLayout: { top: 255, left: 38, fontSize: 40, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "info", label: "정보(시세/낙찰)", defaultLayout: { top: 340, left: 38, fontSize: 34, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "highlight", label: "강조(투자/수익)", defaultLayout: { top: 450, left: 38, fontSize: 44, color: BLACK, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-60": [
    headerField("헤더 문구", 88),
    { key: "label", label: "라벨(비규제아파트(무주택))", defaultLayout: { top: 255, left: 38, fontSize: 34, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "info", label: "정보(시세/낙찰/임차후투자)", defaultLayout: { top: 330, left: 38, fontSize: 30, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "highlight", label: "강조(투자/수익)", defaultLayout: { top: 480, left: 38, fontSize: 38, color: BLACK, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-61": [
    headerField("헤더 문구", 88),
    { key: "label", label: "라벨(비규제빌라(1주택자))", defaultLayout: { top: 255, left: 38, fontSize: 38, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "info", label: "정보(시세/낙찰)", defaultLayout: { top: 335, left: 38, fontSize: 32, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "highlight", label: "강조(투자/수익)", defaultLayout: { top: 445, left: 38, fontSize: 42, color: BLACK, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-62": [
    headerField("헤더 문구", 88),
    { key: "label", label: "라벨(비규제아파트)", defaultLayout: { top: 255, left: 38, fontSize: 38, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "info", label: "정보(시세/낙찰)", defaultLayout: { top: 335, left: 38, fontSize: 32, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "highlight", label: "강조(투자/수익)", defaultLayout: { top: 445, left: 38, fontSize: 42, color: BLACK, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-63": [
    headerField("헤더 문구", 88),
    { key: "label", label: "라벨(비규제빌라)", defaultLayout: { top: 255, left: 38, fontSize: 38, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "info", label: "정보(시세/낙찰)", defaultLayout: { top: 335, left: 38, fontSize: 32, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "highlight", label: "강조(투자/수익)", defaultLayout: { top: 445, left: 38, fontSize: 42, color: BLACK, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-64": [
    headerField("헤더 문구", 88),
    { key: "label", label: "라벨(규제빌라)", defaultLayout: { top: 255, left: 38, fontSize: 38, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "info", label: "정보(시세/낙찰)", defaultLayout: { top: 335, left: 38, fontSize: 32, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "highlight", label: "강조(투자/수익)", defaultLayout: { top: 445, left: 38, fontSize: 42, color: BLACK, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-65": [
    headerField("헤더 문구", 88),
    { key: "info", label: "정보(시세/낙찰/보증금/이자)", defaultLayout: { top: 255, left: 38, fontSize: 30, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "highlight", label: "강조(투자/월이자/예상수익)", defaultLayout: { top: 520, left: 38, fontSize: 38, color: BLACK, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-66": [
    headerField("헤더 문구", 88),
    { key: "info", label: "정보(시세/낙찰/보증금/이자)", defaultLayout: { top: 255, left: 38, fontSize: 30, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "highlight", label: "강조(투자/월이자/예상수익)", defaultLayout: { top: 520, left: 38, fontSize: 38, color: BLACK, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-67": [
    headerField("헤더 문구", 88),
    { key: "info", label: "정보(시세/낙찰/월세)", defaultLayout: { top: 255, left: 38, fontSize: 34, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "highlight", label: "강조(투자/수익)", defaultLayout: { top: 480, left: 38, fontSize: 42, color: BLACK, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-68": [
    headerField("헤더 문구", 88),
    { key: "label", label: "라벨(비규제아파트(무주택))", defaultLayout: { top: 255, left: 38, fontSize: 36, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "info", label: "정보(시세/낙찰/투자/임대후투자)", defaultLayout: { top: 335, left: 38, fontSize: 28, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "highlight", label: "강조(수익)", defaultLayout: { top: 570, left: 38, fontSize: 36, color: BLACK, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-69": [
    headerField("헤더 문구", 88),
    { key: "label", label: "라벨(재개발빌라)", defaultLayout: { top: 255, left: 38, fontSize: 38, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "info", label: "정보(시세/낙찰)", defaultLayout: { top: 335, left: 38, fontSize: 32, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "highlight", label: "강조(투자/예상수익)", defaultLayout: { top: 445, left: 38, fontSize: 42, color: BLACK, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-70": [
    headerField("헤더 문구", 88),
  ],
  "webinar-final_slide-71": [
    { key: "body", label: "본문(그걸 왜 알려주냐?)", defaultLayout: { top: 470, left: 0, fontSize: 100, color: BLUE, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-72": [
    headerField("헤더 문구", 76),
    groupField("line1", "prefix", "1줄 강조(원래)", { top: 300, left: 0, fontSize: 76, color: ORANGE, fontWeight: 700, textAlign: "center" }),
    groupField("line1", "suffix", "1줄 뒤(알려주는거 좋아함)", { top: 300, left: 0, fontSize: 76, color: BLACK, fontWeight: 700, textAlign: "center" }),
    { key: "note", label: "부연설명(친동생, 친구들...)", defaultLayout: { top: 380, left: 0, fontSize: 36, color: BLACK, fontWeight: 500, textAlign: "center" } },
    groupField("line2", "prefix", "2줄 강조(어차피)", { top: 460, left: 0, fontSize: 76, color: ORANGE, fontWeight: 700, textAlign: "center" }),
    groupField("line2", "suffix", "2줄 뒤(넘쳐나는 경매물건)", { top: 460, left: 0, fontSize: 76, color: BLACK, fontWeight: 700, textAlign: "center" }),
    groupField("line3", "prefix", "3줄 앞(알려줘도)", { top: 540, left: 0, fontSize: 76, color: BLACK, fontWeight: 700, textAlign: "center" }),
    groupField("line3", "suffix", "3줄 강조(안해요)", { top: 540, left: 0, fontSize: 76, color: "#E5231C", fontWeight: 700, textAlign: "center" }),
  ],
  "webinar-final_slide-73": [
    { key: "body", label: "본문(꼭 도전해 보세요)", defaultLayout: { top: 470, left: 0, fontSize: 100, color: BLUE, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-74": [
    groupField("line", "prefix", "앞(그래서)", { top: 490, left: 0, fontSize: 76, color: BLACK, fontWeight: 700, textAlign: "center" }),
    groupField("line", "emphasisText", "강조(저도)", { top: 490, left: 0, fontSize: 76, color: BLUE, fontWeight: 700, textAlign: "center" }),
    groupField("line", "suffix", "뒤(할 수 있을까요?)", { top: 490, left: 0, fontSize: 76, color: BLACK, fontWeight: 700, textAlign: "center" }),
  ],
  "webinar-final_slide-75": [
    { key: "line1", label: "1줄(경매 한다고?)", defaultLayout: { top: 310, left: 0, fontSize: 78, color: BLACK, fontWeight: 700, textAlign: "center" } },
    { key: "line2", label: "2줄(해봤는데)", defaultLayout: { top: 480, left: 0, fontSize: 78, color: BLACK, fontWeight: 700, textAlign: "center" } },
    { key: "line3", label: "3줄 강조(레드오션)", defaultLayout: { top: 650, left: 0, fontSize: 78, color: "#E5231C", fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-76": [
    groupField("line1", "emphasisText", "1줄 강조(대출)", { top: 320, left: 0, fontSize: 78, color: BLUE, fontWeight: 700, textAlign: "center" }),
    groupField("line1", "suffix", "1줄 뒤(이 무서워..)", { top: 320, left: 0, fontSize: 78, color: BLACK, fontWeight: 700, textAlign: "center" }),
    groupField("line2", "emphasisText", "2줄 강조(전세)", { top: 480, left: 0, fontSize: 78, color: BLUE, fontWeight: 700, textAlign: "center" }),
    groupField("line2", "suffix", "2줄 뒤(살래 그냥..)", { top: 480, left: 0, fontSize: 78, color: BLACK, fontWeight: 700, textAlign: "center" }),
    groupField("line3", "emphasisText", "3줄 강조(청약)", { top: 640, left: 0, fontSize: 78, color: BLUE, fontWeight: 700, textAlign: "center" }),
    groupField("line3", "suffix", "3줄 뒤(기다리고 있어)", { top: 640, left: 0, fontSize: 78, color: BLACK, fontWeight: 700, textAlign: "center" }),
  ],
  "webinar-final_slide-77": [
    { key: "body", label: "본문(아 된다고? 나도 알려줘 !!)", defaultLayout: { top: 400, left: 0, fontSize: 76, color: BLACK, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-78": [
    headerField("헤더 문구", 88),
    { key: "small", label: "작은 라벨(방법은?)", defaultLayout: { top: 255, left: 38, fontSize: 56, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "info", label: "정보(규제정책인한 두려움 + 방향성)", defaultLayout: { top: 255, left: 520, fontSize: 44, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "highlight", label: "강조(낮은 경쟁입찰)", defaultLayout: { top: 330, left: 520, fontSize: 56, color: BLUE, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-79": [
    headerField("헤더 문구", 88),
    groupField("line", "prefix", "앞(연이은)", { top: 560, left: 38, fontSize: 64, color: BLACK, fontWeight: 700, textAlign: "left" }),
    groupField("line", "emphasisText", "강조(낙찰)", { top: 560, left: 0, fontSize: 64, color: BLUE, fontWeight: 700, textAlign: "left" }),
    groupField("line", "suffix", "뒤(소식)", { top: 560, left: 0, fontSize: 64, color: BLACK, fontWeight: 700, textAlign: "left" }),
  ],
  "webinar-final_slide-80": [
    { key: "body", label: "본문(여러분도 가능합니다!)", defaultLayout: { top: 490, left: 0, fontSize: 90, color: BLUE, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-81": [
    headerField("헤더 문구", 77),
    { key: "line1", label: "1줄(5분)", defaultLayout: { top: 400, left: 0, fontSize: 88, color: "#E5231C", fontWeight: 700, textAlign: "center" } },
    { key: "line2", label: "2줄(8시 40분)", defaultLayout: { top: 550, left: 0, fontSize: 88, color: "#E5231C", fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-82": [
    { key: "line1", label: "1줄(여러분은 과연)", defaultLayout: { top: 400, left: 0, fontSize: 70, color: BLACK, fontWeight: 700, textAlign: "center" } },
    groupField("line2", "emphasisText", "2줄 강조(무엇을)", { top: 560, left: 0, fontSize: 70, color: BLUE, fontWeight: 700, textAlign: "center" }),
    groupField("line2", "suffix", "2줄 뒤(걱정할까요?)", { top: 560, left: 0, fontSize: 70, color: BLACK, fontWeight: 700, textAlign: "center" }),
  ],
  "webinar-final_slide-83": [
    { key: "emoji", label: "이모지(🤔)", defaultLayout: { top: 400, left: 150, fontSize: 180, color: BLACK, fontWeight: 500, textAlign: "left" } },
    groupField("line", "emphasisText", "강조(시간많은)", { top: 255, left: 600, fontSize: 70, color: BLUE, fontWeight: 700, textAlign: "left" }),
    groupField("line", "prefix", "앞(경매)", { top: 255, left: 600, fontSize: 70, color: BLACK, fontWeight: 700, textAlign: "left" }),
    { key: "line2", label: "2줄(사람만)", defaultLayout: { top: 255, left: 600, fontSize: 70, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "line3", label: "3줄(하는거 아니야?)", defaultLayout: { top: 255, left: 600, fontSize: 70, color: BLACK, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-84": [
    { key: "label1", label: "라벨(물건조사)", defaultLayout: { top: 230, left: 100, fontSize: 48, color: "#7B2FBE", fontWeight: 700, textAlign: "left" } },
    { key: "emoji", label: "이모지(⏰)", defaultLayout: { top: 340, left: 100, fontSize: 150, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "label2", label: "라벨(임장)", defaultLayout: { top: 800, left: 130, fontSize: 48, color: "#E5231C", fontWeight: 700, textAlign: "left" } },
    { key: "time", label: "시간(하루 4-5시간)", defaultLayout: { top: 430, left: 550, fontSize: 64, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "arrow", label: "화살표(➡)", defaultLayout: { top: 470, left: 960, fontSize: 80, color: "#E5231C", fontWeight: 500, textAlign: "left" } },
    { key: "give_up", label: "강조(포기!)", defaultLayout: { top: 440, left: 1150, fontSize: 100, color: BLUE, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-85": [
    { key: "line1", label: "1줄(경매 이제)", defaultLayout: { top: 410, left: 0, fontSize: 70, color: BLACK, fontWeight: 700, textAlign: "center" } },
    groupField("line1", "emphasisText", "1줄 강조(직접)", { top: 410, left: 0, fontSize: 70, color: BLUE, fontWeight: 700, textAlign: "center" }),
    { key: "line2", label: "2줄(하지 마세요.)", defaultLayout: { top: 570, left: 0, fontSize: 70, color: BLACK, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-86": [
    { key: "line1", label: "1줄(정답은)", defaultLayout: { top: 410, left: 0, fontSize: 70, color: BLACK, fontWeight: 700, textAlign: "center" } },
    { key: "line2", label: "2줄 강조(스마트 경매)", defaultLayout: { top: 570, left: 0, fontSize: 70, color: BLUE, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-87": [
    groupField("title", "prefix", "제목(모두)", { top: 60, left: 0, fontSize: 64, color: BLACK, fontWeight: 700, textAlign: "center" }),
    groupField("title", "emphasisText", "제목 강조(대행)", { top: 60, left: 0, fontSize: 64, color: BLUE, fontWeight: 700, textAlign: "center" }),
    groupField("title", "suffix", "제목 뒤(으로 가능)", { top: 60, left: 0, fontSize: 64, color: BLACK, fontWeight: 700, textAlign: "center" }),
    { key: "label1", label: "항목1(물건찾기)", defaultLayout: { top: 450, left: 260, fontSize: 26, color: BLACK, fontWeight: 700, textAlign: "center" } },
    { key: "label2", label: "항목2(시세조사 & 권리분석)", defaultLayout: { top: 450, left: 700, fontSize: 26, color: BLACK, fontWeight: 700, textAlign: "center" } },
    { key: "label3", label: "항목3(현장임장)", defaultLayout: { top: 450, left: 1400, fontSize: 26, color: BLACK, fontWeight: 700, textAlign: "center" } },
    { key: "label4", label: "항목4(입찰 및 대출)", defaultLayout: { top: 860, left: 150, fontSize: 26, color: BLACK, fontWeight: 700, textAlign: "center" } },
    { key: "label5", label: "항목5(명도)", defaultLayout: { top: 860, left: 570, fontSize: 26, color: BLACK, fontWeight: 700, textAlign: "center" } },
    { key: "label6", label: "항목6(인테리어)", defaultLayout: { top: 860, left: 990, fontSize: 26, color: BLACK, fontWeight: 700, textAlign: "center" } },
    { key: "label7", label: "항목7(매도)", defaultLayout: { top: 860, left: 1410, fontSize: 26, color: BLACK, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-88": [
    headerField("헤더 문구", 88),
  ],
  "webinar-final_slide-89": [
    groupField("title", "highlight", "강조(입찰!)", { top: 120, left: 0, fontSize: 64, color: BLACK, fontWeight: 700, textAlign: "center", backgroundColor: YELLOW_BG2 }),
    groupField("title", "suffix", "뒤(법원가지마세요)", { top: 120, left: 0, fontSize: 64, color: BLACK, fontWeight: 700, textAlign: "center" }),
    { key: "subtitle", label: "부제목(대리입찰 서비스)", defaultLayout: { top: 220, left: 0, fontSize: 64, color: BLUE, fontWeight: 700, textAlign: "center" } },
    { key: "cardTitle", label: "카드 제목(바토너 · batoner.kr)", defaultLayout: { top: 824, left: 310, fontSize: 24, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "cardSubtitle", label: "카드 부제(바토너 - 법원...)", defaultLayout: { top: 854, left: 310, fontSize: 24, color: "#7B2FBE", fontWeight: 700, textAlign: "left" } },
    { key: "cardBody", label: "카드 본문(바토너는 법원경매...)", defaultLayout: { top: 884, left: 310, fontSize: 24, color: "#666666", fontWeight: 500, textAlign: "left" } },
  ],
  "webinar-final_slide-90": [
    { key: "badge", label: "배지(알림톡 도착)", defaultLayout: { top: 60, left: 1080, fontSize: 24, color: "#111111", fontWeight: 700, textAlign: "left", backgroundColor: YELLOW_BG2 } },
    { key: "notice_label", label: "라벨(입찰결과안내)", defaultLayout: { top: 100, left: 1080, fontSize: 24, color: "#aaaaaa", fontWeight: 500, textAlign: "left" } },
    { key: "result", label: "결과(낙찰)", defaultLayout: { top: 140, left: 1080, fontSize: 40, color: WHITE, fontWeight: 700, textAlign: "left" } },
    { key: "greeting", label: "인사말(코치님, 입찰 결과...)", defaultLayout: { top: 200, left: 1080, fontSize: 24, color: WHITE, fontWeight: 500, textAlign: "left" } },
    { key: "case_info", label: "사건정보(사건번호/결과)", defaultLayout: { top: 260, left: 1080, fontSize: 24, color: WHITE, fontWeight: 500, textAlign: "left" } },
    { key: "congrats", label: "축하 문구(낙찰을 축하드립니다)", defaultLayout: { top: 320, left: 1080, fontSize: 24, color: WHITE, fontWeight: 500, textAlign: "left" } },
    { key: "thanks", label: "감사 문구(이용해 주셔서...)", defaultLayout: { top: 400, left: 1080, fontSize: 24, color: WHITE, fontWeight: 500, textAlign: "left" } },
  ],
  "webinar-final_slide-91": [
    groupField("line1", "prefix", "앞(이제는)", { top: 65, left: 186, fontSize: 152, color: BLACK, fontWeight: 500, textAlign: "left" }),
    groupField("line1", "emphasisText", "강조(임장)", { top: 65, left: 186, fontSize: 152, color: BLUE, fontWeight: 500, textAlign: "left" }),
    groupField("line1", "suffix", "뒤(부탁하세요)", { top: 65, left: 186, fontSize: 152, color: BLACK, fontWeight: 500, textAlign: "left" }),
    { key: "line2", label: "2줄(당근/해주세요)", defaultLayout: { top: 610, left: 186, fontSize: 199, color: BLUE, fontWeight: 500, textAlign: "left" } },
    { key: "cardTitle", label: "카드 제목(해주세요)", defaultLayout: { top: 874, left: 400, fontSize: 24, color: "#666666", fontWeight: 500, textAlign: "left" } },
    { key: "cardSubtitle", label: "카드 부제", defaultLayout: { top: 904, left: 400, fontSize: 24, color: "#7B2FBE", fontWeight: 700, textAlign: "left" } },
    { key: "cardBody", label: "카드 본문", defaultLayout: { top: 934, left: 400, fontSize: 24, color: "#333333", fontWeight: 500, textAlign: "left" } },
  ],
  "webinar-final_slide-92": [],
  "webinar-final_slide-93": [
    groupField("line1", "prefix", "앞(낙찰 후)", { top: 90, left: 186, fontSize: 152, color: BLACK, fontWeight: 500, textAlign: "left" }),
    groupField("line1", "emphasisText", "강조(청소/인테리어)", { top: 90, left: 186, fontSize: 152, color: BLUE, fontWeight: 500, textAlign: "left" }),
    { key: "line2", label: "2줄(당근/해주세요)", defaultLayout: { top: 610, left: 186, fontSize: 199, color: BLUE, fontWeight: 500, textAlign: "left" } },
    { key: "cardTitle", label: "카드 제목(당근)", defaultLayout: { top: 874, left: 530, fontSize: 24, color: "#666666", fontWeight: 500, textAlign: "left" } },
    { key: "cardSubtitle", label: "카드 부제", defaultLayout: { top: 904, left: 530, fontSize: 24, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "cardBody", label: "카드 본문", defaultLayout: { top: 934, left: 530, fontSize: 24, color: "#333333", fontWeight: 500, textAlign: "left" } },
  ],
  "webinar-final_slide-94": [],
  "webinar-final_slide-95": [
    groupField("line1", "prefix", "앞(낙찰 후)", { top: 90, left: 186, fontSize: 152, color: BLACK, fontWeight: 500, textAlign: "left" }),
    groupField("line1", "emphasisText", "강조(명도)", { top: 90, left: 186, fontSize: 152, color: BLUE, fontWeight: 500, textAlign: "left" }),
    { key: "line2", label: "2줄(당근/해주세요)", defaultLayout: { top: 610, left: 186, fontSize: 199, color: BLUE, fontWeight: 500, textAlign: "left" } },
    { key: "cardTitle", label: "카드 제목(당근)", defaultLayout: { top: 874, left: 530, fontSize: 24, color: "#666666", fontWeight: 500, textAlign: "left" } },
    { key: "cardSubtitle", label: "카드 부제", defaultLayout: { top: 904, left: 530, fontSize: 24, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "cardBody", label: "카드 본문", defaultLayout: { top: 934, left: 530, fontSize: 24, color: "#333333", fontWeight: 500, textAlign: "left" } },
  ],
  "webinar-final_slide-96": [],
  "webinar-final_slide-97": [
    groupField("line1", "prefix", "앞(낙찰 후)", { top: 90, left: 186, fontSize: 152, color: BLACK, fontWeight: 500, textAlign: "left" }),
    groupField("line1", "emphasisText", "강조(매도)", { top: 90, left: 186, fontSize: 152, color: BLUE, fontWeight: 500, textAlign: "left" }),
    { key: "line2", label: "2줄(네이버 부동산)", defaultLayout: { top: 610, left: 186, fontSize: 199, color: BLUE, fontWeight: 500, textAlign: "left" } },
  ],
  "webinar-final_slide-98": [
    groupField("line1", "emphasisText", "강조(돈많은)", { top: 400, left: 0, fontSize: 70, color: BLUE, fontWeight: 700, textAlign: "center" }),
    groupField("line1", "suffix", "뒤(사람만)", { top: 400, left: 0, fontSize: 70, color: BLACK, fontWeight: 700, textAlign: "center" }),
    { key: "line2", label: "2줄(하는거 아니야?)", defaultLayout: { top: 560, left: 0, fontSize: 70, color: BLACK, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-99": [
    headerField("헤더 문구", 88),
    { key: "card1_label", label: "카드1 라벨(비규제빌라)", defaultLayout: { top: 275, left: 86, fontSize: 24, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "card1_info", label: "카드1 정보(시세/낙찰)", defaultLayout: { top: 315, left: 86, fontSize: 20, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "card1_highlight", label: "카드1 강조(투자/수익)", defaultLayout: { top: 375, left: 86, fontSize: 26, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "card2_label", label: "카드2 라벨(비규제빌라(1주택자))", defaultLayout: { top: 275, left: 720, fontSize: 24, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "card2_info", label: "카드2 정보(시세/낙찰)", defaultLayout: { top: 315, left: 720, fontSize: 20, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "card2_highlight", label: "카드2 강조(투자/수익)", defaultLayout: { top: 375, left: 720, fontSize: 26, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "card3_label", label: "카드3 라벨(다세대주택)", defaultLayout: { top: 275, left: 1380, fontSize: 24, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "card3_info", label: "카드3 정보(시세/낙찰)", defaultLayout: { top: 315, left: 1380, fontSize: 20, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "card3_highlight", label: "카드3 강조(투자/수익)", defaultLayout: { top: 375, left: 1380, fontSize: 26, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "card4_label", label: "카드4 라벨(비규제아파트)", defaultLayout: { top: 680, left: 86, fontSize: 24, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "card4_info", label: "카드4 정보(시세/낙찰)", defaultLayout: { top: 720, left: 86, fontSize: 20, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "card4_highlight", label: "카드4 강조(투자/수익)", defaultLayout: { top: 780, left: 86, fontSize: 26, color: BLACK, fontWeight: 700, textAlign: "left" } },
    { key: "card5_label", label: "카드5 라벨(비규제아파트(무주택))", defaultLayout: { top: 670, left: 820, fontSize: 24, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "card5_info", label: "카드5 정보(시세/낙찰)", defaultLayout: { top: 710, left: 820, fontSize: 20, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "card5_highlight", label: "카드5 강조(투자/수익)", defaultLayout: { top: 770, left: 820, fontSize: 24, color: BLACK, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-100": [
    groupField("line1", "emphasisText", "강조(1000만원으로도)", { top: 400, left: 0, fontSize: 70, color: BLUE, fontWeight: 700, textAlign: "center" }),
    { key: "line2", label: "2줄(수익을 내고 있습니다.)", defaultLayout: { top: 560, left: 0, fontSize: 70, color: BLACK, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-101": [
    groupField("line1", "emphasisText", "강조(1000만원으로도)", { top: 400, left: 0, fontSize: 70, color: BLUE, fontWeight: 700, textAlign: "center" }),
    { key: "line2", label: "2줄(수익을 내고 있습니다.)", defaultLayout: { top: 560, left: 0, fontSize: 70, color: BLACK, fontWeight: 700, textAlign: "center" } },
  ],
  "webinar-final_slide-102": [
    { key: "body", label: "본문(메모 텍스트)", defaultLayout: { top: 112, left: 79, fontSize: 70, color: BLUE, fontWeight: 500, textAlign: "left" } },
  ],
  "webinar-final_slide-103": [
    { key: "emoji", label: "이모지(🤔)", defaultLayout: { top: 323, left: 100, fontSize: 180, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "line1", label: "1줄(소득이 없는데)", defaultLayout: { top: 323, left: 543, fontSize: 70, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "line2", label: "2줄(대출이 될까요?)", defaultLayout: { top: 483, left: 543, fontSize: 70, color: BLACK, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-104": [
    { key: "title", label: "제목(경락잔금대출)", defaultLayout: { top: 73, left: 130, fontSize: 44, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "body", label: "본문(감정가/낙찰가 비율)", defaultLayout: { top: 354, left: 236, fontSize: 60, color: BLACK, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-105": [
    { key: "title", label: "제목(경락잔금대출)", defaultLayout: { top: 73, left: 130, fontSize: 44, color: BLUE, fontWeight: 700, textAlign: "left" } },
    { key: "body", label: "본문(1억 낙찰/투자금)", defaultLayout: { top: 295, left: 130, fontSize: 60, color: BLACK, fontWeight: 700, textAlign: "left" } },
  ],
  "webinar-final_slide-106": [
    { key: "body", label: "본문(대출/세금 상담)", defaultLayout: { top: 367, left: 74, fontSize: 98, color: BLACK, fontWeight: 500, textAlign: "center" } },
  ],
  "webinar-final_slide-107": [
    { key: "title", label: "제목(50대 어머님)", defaultLayout: { top: 55, left: 0, fontSize: 85, color: BLUE, fontWeight: 500, textAlign: "center" } },
    { key: "loanInfo", label: "낙찰/대출 정보", defaultLayout: { top: 215, left: 1143, fontSize: 88, color: BLACK, fontWeight: 500, textAlign: "left" } },
    groupField("investment", "prefix", "투자 앞 문구", { top: 430, left: 1143, fontSize: 88, color: BLACK, fontWeight: 500, textAlign: "left" }),
    groupField("investment", "highlight", "투자 강조 금액", { top: 430, left: 0, fontSize: 121, color: BLACK, fontWeight: 500, textAlign: "left", backgroundColor: "#F5E541" }),
    { key: "sale", label: "매도 정보", defaultLayout: { top: 650, left: 1143, fontSize: 88, color: BLACK, fontWeight: 500, textAlign: "left" } },
    groupField("profit", "prefix", "차익 앞 문구", { top: 825, left: 1143, fontSize: 88, color: BLACK, fontWeight: 500, textAlign: "left" }),
    groupField("profit", "highlight", "차익 강조 금액", { top: 825, left: 0, fontSize: 140, color: BLACK, fontWeight: 500, textAlign: "left", backgroundColor: "#F5E541" }),
  ],
  "webinar-final_slide-108": [
    { key: "title", label: "제목(경락잔금대출)", defaultLayout: { top: 16, left: 45, fontSize: 109, color: BLUE, fontWeight: 500, textAlign: "left" } },
    { key: "line1", label: "본문(소득이 없어도 가능합니다)", defaultLayout: { top: 186, left: 45, fontSize: 126, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "line2", label: "부연(은퇴 후 소득이 없는 아버님)", defaultLayout: { top: 315, left: 45, fontSize: 85, color: BLACK, fontWeight: 500, textAlign: "left" } },
  ],
  "webinar-final_slide-109": [
    groupField("line1", "emphasisText", "강조(경매)", { top: 173, left: 473, fontSize: 160, color: BLUE, fontWeight: 500, textAlign: "left" }),
    groupField("line1", "suffix", "뒤(너무 어렵고)", { top: 173, left: 0, fontSize: 160, color: BLACK, fontWeight: 500, textAlign: "left" }),
    { key: "line2", label: "2줄(힘든거 아니야?)", defaultLayout: { top: 348, left: 640, fontSize: 160, color: BLACK, fontWeight: 500, textAlign: "left" } },
    groupField("footer", "prefix", "하단 앞(여러분이)", { top: 732, left: 769, fontSize: 85, color: BLACK, fontWeight: 500, textAlign: "left" }),
    groupField("footer", "emphasisText", "하단 강조(생각하는)", { top: 732, left: 0, fontSize: 85, color: BLUE, fontWeight: 500, textAlign: "left" }),
    groupField("footer", "suffix", "하단 뒤(경매)", { top: 732, left: 0, fontSize: 85, color: BLACK, fontWeight: 500, textAlign: "left" }),
  ],
  "webinar-final_slide-110": [
    { key: "leftTitle", label: "왼쪽 제목(총 경매 물건)", defaultLayout: { top: 145, left: 89, fontSize: 85, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "rightTitle", label: "오른쪽 제목(특수 물건 제외)", defaultLayout: { top: 145, left: 1037, fontSize: 85, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "note", label: "강조 문구(10% 이하)", defaultLayout: { top: 264, left: 580, fontSize: 175, color: "#FC0303", fontWeight: 500, textAlign: "left" } },
  ],
  "webinar-final_slide-111": [
    { key: "headerTitle", label: "헤더 문구", defaultLayout: { top: 57, left: 73, fontSize: 80, color: WHITE, fontWeight: 500, textAlign: "left" } },
  ],
  "webinar-final_slide-112": [
    { key: "title", label: "제목(90%물건)", defaultLayout: { top: 75, left: 446, fontSize: 160, color: BLUE, fontWeight: 500, textAlign: "left" } },
    { key: "market", label: "시세파악", defaultLayout: { top: 286, left: 635, fontSize: 188, color: "#FD8A69", fontWeight: 500, textAlign: "left" } },
    { key: "margin", label: "안전마진", defaultLayout: { top: 532, left: 902, fontSize: 111, color: BLACK, fontWeight: 500, textAlign: "left" } },
    { key: "bid", label: "입찰가", defaultLayout: { top: 697, left: 997, fontSize: 111, color: BLACK, fontWeight: 500, textAlign: "left" } },
  ],
  "webinar-final_slide-113": [
    groupField("line", "emphasisText", "강조(명도)", { top: 435, left: 474, fontSize: 151, color: BLUE, fontWeight: 500, textAlign: "left" }),
    groupField("line", "suffix", "뒤(너무 걱정돼요)", { top: 435, left: 0, fontSize: 151, color: BLACK, fontWeight: 500, textAlign: "left" }),
  ],
  "webinar-final_slide-114": [
    { key: "title", label: "제목(명도?)", defaultLayout: { top: 45, left: 445, fontSize: 160, color: BLUE, fontWeight: 500, textAlign: "left" } },
    groupField("footer", "prefix", "하단 앞(여러분이 생각하는)", { top: 903, left: 525, fontSize: 85, color: BLACK, fontWeight: 500, textAlign: "left" }),
    groupField("footer", "emphasisText", "하단 강조(명도)", { top: 903, left: 0, fontSize: 85, color: BLUE, fontWeight: 500, textAlign: "left" }),
  ],
  "webinar-final_slide-115": [
    { key: "title", label: "제목(미해결 명도 0건)", defaultLayout: { top: 123, left: 121, fontSize: 134, color: BLUE, fontWeight: 500, textAlign: "center" } },
    { key: "line1", label: "본문 1줄", defaultLayout: { top: 446, left: 151, fontSize: 98, color: BLACK, fontWeight: 500, textAlign: "center" } },
    { key: "line2", label: "본문 2줄", defaultLayout: { top: 586, left: 151, fontSize: 98, color: BLACK, fontWeight: 500, textAlign: "center" } },
    groupField("line3", "prefix", "괄호 열기", { top: 728, left: 312, fontSize: 98, color: BLACK, fontWeight: 500, textAlign: "left" }),
    groupField("line3", "emphasisText", "강조(최소 200만원 이상 절약효과)", { top: 728, left: 0, fontSize: 98, color: BLUE, fontWeight: 500, textAlign: "left" }),
    groupField("line3", "suffix", "괄호 닫기", { top: 728, left: 0, fontSize: 98, color: BLACK, fontWeight: 500, textAlign: "left" }),
  ],
};

const SLIDE_BACKGROUND: Record<string, string> = {
  "webinar-2607_slide-01": BLUE,
  "webinar-2607_slide-10": WHITE,
  "webinar-final_slide-04": BLUE,
  "webinar-final_slide-17": WHITE,
  "webinar-final_slide-34": WHITE,
  "webinar-final_slide-38": "#333333",
  "webinar-final_slide-41": WHITE,
  "webinar-final_slide-42": WHITE,
  "webinar-final_slide-43": WHITE,
  "webinar-final_slide-44": WHITE,
  "webinar-final_slide-45": WHITE,
  "webinar-final_slide-48": "#1a1a1a",
  "webinar-final_slide-49": "#1a1a1a",
  "webinar-final_slide-54": WHITE,
  "webinar-final_slide-55": WHITE,
  "webinar-final_slide-56": WHITE,
  "webinar-final_slide-57": WHITE,
  "webinar-final_slide-58": WHITE,
  "webinar-final_slide-59": WHITE,
  "webinar-final_slide-60": WHITE,
  "webinar-final_slide-61": WHITE,
  "webinar-final_slide-62": WHITE,
  "webinar-final_slide-63": WHITE,
  "webinar-final_slide-64": WHITE,
  "webinar-final_slide-65": WHITE,
  "webinar-final_slide-66": WHITE,
  "webinar-final_slide-67": WHITE,
  "webinar-final_slide-68": WHITE,
  "webinar-final_slide-69": WHITE,
  "webinar-final_slide-70": WHITE,
  "webinar-final_slide-72": WHITE,
  "webinar-final_slide-78": WHITE,
  "webinar-final_slide-79": WHITE,
  "webinar-final_slide-88": WHITE,
  "webinar-final_slide-99": WHITE,
  "webinar-final_slide-106": WHITE,
  "webinar-final_slide-107": WHITE,
  "webinar-final_slide-108": WHITE,
  "webinar-final_slide-109": WHITE,
  "webinar-final_slide-110": WHITE,
  "webinar-final_slide-111": WHITE,
  "webinar-final_slide-112": WHITE,
  "webinar-final_slide-113": WHITE,
  "webinar-final_slide-114": WHITE,
  "webinar-final_slide-115": WHITE,
};
const DEFAULT_BACKGROUND = "#F8F8F8";

/** 상단 헤더 배너(높이 px + 배경색). 원본 .header 클래스와 동일한 슬라이드만 등록.
 *  이 배너를 안 그리면 헤더 문구(흰 글씨)가 밝은 배경 위에 떠서 안 보인다
 *  (실제로 이 문제가 발생했다, 2026-07-24). */
const SLIDE_HEADER: Record<string, { height: number; color: string }> = {
  "webinar-2607_slide-10": { height: 242, color: "#3157B7" },
  "webinar-2607_slide-12": { height: 242, color: "#3157B7" },
  "webinar-2607_slide-13": { height: 242, color: "#3157B7" },
  "webinar-2607_slide-15": { height: 242, color: "#3157B7" },
  "webinar-2607_slide-16": { height: 326, color: "#3157B7" },
  "webinar-2607_slide-17": { height: 242, color: "#3157B7" },
  "webinar-2607_slide-18": { height: 242, color: "#3157B7" },
  "webinar-2607_slide-19": { height: 242, color: "#3157B7" },
  "webinar-2607_slide-20": { height: 242, color: "#3157B7" },
  "webinar-2607_slide-21": { height: 242, color: "#3157B7" },
  "webinar-2607_slide-22": { height: 242, color: "#3157B7" },
  "webinar-2607_slide-23": { height: 242, color: "#3157B7" },
  "webinar-final_slide-01": { height: 236, color: "#FC5230" },
  "webinar-final_slide-02": { height: 236, color: "#FC5230" },
  "webinar-final_slide-03": { height: 236, color: "#FC5230" },
  "webinar-final_slide-08": { height: 236, color: "#3157B7" },
  "webinar-final_slide-11": { height: 236, color: "#3157B7" },
  "webinar-final_slide-12": { height: 236, color: "#3157B7" },
  "webinar-final_slide-13": { height: 236, color: "#3157B7" },
  "webinar-final_slide-14": { height: 236, color: "#3157B7" },
  "webinar-final_slide-15": { height: 236, color: "#3157B7" },
  "webinar-final_slide-17": { height: 242, color: "#3157B7" },
  "webinar-final_slide-18": { height: 242, color: "#3157B7" },
  "webinar-final_slide-19": { height: 242, color: "#3157B7" },
  "webinar-final_slide-20": { height: 242, color: "#3157B7" },
  "webinar-final_slide-21": { height: 236, color: "#3157B7" },
  "webinar-final_slide-23": { height: 236, color: "#3157B7" },
  "webinar-final_slide-29": { height: 236, color: "#3157B7" },
  "webinar-final_slide-30": { height: 236, color: "#3157B7" },
  "webinar-final_slide-32": { height: 236, color: "#3157B7" },
  "webinar-final_slide-33": { height: 236, color: "#3157B7" },
  "webinar-final_slide-34": { height: 236, color: "#3157B7" },
  "webinar-final_slide-35": { height: 236, color: "#3157B7" },
  "webinar-final_slide-41": { height: 236, color: "#3157B7" },
  "webinar-final_slide-42": { height: 236, color: "#3157B7" },
  "webinar-final_slide-43": { height: 236, color: "#3157B7" },
  "webinar-final_slide-44": { height: 236, color: "#3157B7" },
  "webinar-final_slide-45": { height: 236, color: "#3157B7" },
  "webinar-final_slide-46": { height: 236, color: "#3157B7" },
  "webinar-final_slide-47": { height: 236, color: "#3157B7" },
  "webinar-final_slide-55": { height: 236, color: "#3157B7" },
  "webinar-final_slide-56": { height: 236, color: "#3157B7" },
  "webinar-final_slide-57": { height: 236, color: "#3157B7" },
  "webinar-final_slide-58": { height: 236, color: "#3157B7" },
  "webinar-final_slide-59": { height: 236, color: "#3157B7" },
  "webinar-final_slide-60": { height: 236, color: "#3157B7" },
  "webinar-final_slide-61": { height: 236, color: "#3157B7" },
  "webinar-final_slide-62": { height: 236, color: "#3157B7" },
  "webinar-final_slide-63": { height: 236, color: "#3157B7" },
  "webinar-final_slide-64": { height: 236, color: "#3157B7" },
  "webinar-final_slide-65": { height: 236, color: "#3157B7" },
  "webinar-final_slide-66": { height: 236, color: "#3157B7" },
  "webinar-final_slide-67": { height: 236, color: "#3157B7" },
  "webinar-final_slide-68": { height: 236, color: "#3157B7" },
  "webinar-final_slide-69": { height: 236, color: "#3157B7" },
  "webinar-final_slide-70": { height: 236, color: "#3157B7" },
  "webinar-final_slide-72": { height: 236, color: "#3157B7" },
  "webinar-final_slide-78": { height: 236, color: "#3157B7" },
  "webinar-final_slide-79": { height: 236, color: "#3157B7" },
  "webinar-final_slide-81": { height: 236, color: "#FC5230" },
  "webinar-final_slide-88": { height: 236, color: "#3157B7" },
  "webinar-final_slide-99": { height: 236, color: "#3157B7" },
  "webinar-final_slide-111": { height: 242, color: "#3157B7" },
};

function mergeLayout(
  slide: LectureSlide,
  fieldDefs: { key: string; defaultLayout: LectureFieldLayout }[],
): Record<string, LectureFieldLayout> {
  const result: Record<string, LectureFieldLayout> = {};
  for (const def of fieldDefs) {
    result[def.key] = slide.layout?.[def.key] ?? def.defaultLayout;
  }
  return result;
}

function EditableSlideCanvas({
  slide,
  content,
  layout,
  images,
  selectedKey,
  onSelect,
  onLayoutChange,
  onDragStart,
  onImagesChange,
  onImageAdd,
}: {
  slide: LectureSlide;
  content: Record<string, string>;
  layout: Record<string, LectureFieldLayout>;
  images: LectureImagePlacement[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onLayoutChange: (key: string, patch: Partial<LectureFieldLayout>) => void;
  /** 드래그를 시작하기 직전(아직 위치가 바뀌기 전)에 호출된다 — undo 스냅샷은
   *  반드시 "바뀌기 전" 상태를 저장해야 하므로 pointerDown 시점에 호출해야 한다. */
  onDragStart: () => void;
  onImagesChange: (images: LectureImagePlacement[]) => void;
  /** 붙여넣기로 새 이미지가 추가되기 직전에 호출된다(undo 스냅샷용). */
  onImageAdd: () => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    key: string;
    startX: number;
    startY: number;
    origTop: number;
    origLeft: number;
    moved: boolean;
  } | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const imageDrag = useRef<{
    id: string;
    startX: number;
    startY: number;
    origTop: number;
    origLeft: number;
    mode: "move" | "resize";
    origWidth: number;
  } | null>(null);

  async function addImageFromFile(file: File) {
    setUploading(true);
    try {
      const url = await uploadLectureImage(file);
      onImageAdd();
      const placed: LectureImagePlacement = {
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        src: url,
        top: 200,
        left: 200,
        width: 400,
      };
      onImagesChange([...images, placed]);
      setSelectedImageId(placed.id);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "이미지 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  }

  /** PPT에서 도형/사진을 Ctrl+C로 복사하면 클립보드에 image/* 항목이 아예 없거나
   *  (DIB 비트맵 전용, 브라우저 File API로 못 꺼냄), HTML 형식 안에 파일 경로/데이터
   *  URI로만 이미지가 들어있는 경우가 있다(PowerPoint 버전마다 다름). image/* 항목을
   *  먼저 찾고, 없으면 text/html 안의 <img src="data:..."> 를 찾아 디코딩한다. */
  function handlePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((i) => i.type.startsWith("image/"));
    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (file) void addImageFromFile(file);
      return;
    }

    const html = e.clipboardData.getData("text/html");
    if (html) {
      const match = html.match(/<img[^>]+src="(data:image\/[^";]+;base64,[^"]+)"/i);
      if (match) {
        e.preventDefault();
        void addImageFromDataUrl(match[1]);
        return;
      }
    }

    if (items.some((i) => i.type.startsWith("image/") === false && i.kind === "string")) {
      // 이미지도 데이터 URI도 없는 경우(PPT가 DIB 비트맵만 넣은 경우) — 안내만 하고
      // 기본 붙여넣기 동작(텍스트 등)은 막지 않는다.
      window.alert(
        "PPT에서 복사한 이미지를 인식하지 못했습니다. PPT에서 이미지를 우클릭 → \"그림으로 저장\" 후 " +
          "\"이미지 추가\" 버튼으로 파일을 선택해 주세요.",
      );
    }
  }

  async function addImageFromDataUrl(dataUrl: string) {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const ext = blob.type.split("/")[1] || "png";
    const file = new File([blob], `pasted.${ext}`, { type: blob.type });
    await addImageFromFile(file);
  }

  function handleImagePointerDown(e: React.PointerEvent, img: LectureImagePlacement, mode: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    setSelectedImageId(img.id);
    onSelect("");
    imageDrag.current = {
      id: img.id,
      startX: e.clientX,
      startY: e.clientY,
      origTop: img.top,
      origLeft: img.left,
      origWidth: img.width,
      mode,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleImagePointerMove(e: React.PointerEvent) {
    const drag = imageDrag.current;
    if (!drag) return;
    const dxSlide = (e.clientX - drag.startX) / SCALE;
    const dySlide = (e.clientY - drag.startY) / SCALE;
    onImagesChange(
      images.map((img) => {
        if (img.id !== drag.id) return img;
        if (drag.mode === "resize") {
          return { ...img, width: Math.max(20, Math.round(drag.origWidth + dxSlide)) };
        }
        return {
          ...img,
          top: Math.round(drag.origTop + dySlide),
          left: Math.round(drag.origLeft + dxSlide),
        };
      }),
    );
  }

  function handleImagePointerUp() {
    imageDrag.current = null;
  }

  function handleDeleteSelectedImage() {
    if (!selectedImageId) return;
    onImagesChange(images.filter((img) => img.id !== selectedImageId));
    setSelectedImageId(null);
  }

  /** dragKey: 드래그로 top/left가 바뀌는 대상(그룹이면 항상 리더 필드).
   *  selectKey: 편집 패널에서 선택할 필드(그룹 안의 개별 조각을 클릭했으면 그 조각). */
  function handlePointerDown(e: React.PointerEvent, dragKey: string, selectKey: string = dragKey) {
    e.preventDefault();
    onSelect(selectKey);
    const current = layout[dragKey];
    dragState.current = {
      key: dragKey,
      startX: e.clientX,
      startY: e.clientY,
      origTop: current.top,
      origLeft: current.left,
      moved: false,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragState.current;
    if (!drag) return;
    if (!drag.moved) {
      // 실제로 위치가 바뀌기 직전(첫 이동 감지 시점)에 undo 스냅샷을 찍는다.
      // pointerDown 시점에 매번 찍으면 클릭만 하고 안 옮겨도 스택이 쌓인다.
      onDragStart();
    }
    const dxSlide = (e.clientX - drag.startX) / SCALE;
    const dySlide = (e.clientY - drag.startY) / SCALE;
    drag.moved = true;
    onLayoutChange(drag.key, {
      left: Math.round(drag.origLeft + dxSlide),
      top: Math.round(drag.origTop + dySlide),
    });
  }

  function handlePointerUp() {
    dragState.current = null;
  }

  const background = SLIDE_BACKGROUND[slide.id] ?? DEFAULT_BACKGROUND;
  const fieldDefs = SLIDE_FIELD_DEFS[slide.id] ?? [];
  const fixedImages = SLIDE_IMAGES[slide.id] ?? [];

  // key에 GROUP_SEP이 있으면 groupKeyOf 기준으로 묶는다. 그룹의 대표
  // top/left/textAlign은 그룹의 첫 번째 필드 값을 쓴다(겹침 방지: 조각별
  // left를 따로 두지 않고 flex로 자동 배치).
  const rows: { groupKey: string; fields: typeof fieldDefs }[] = [];
  const rowIndex = new Map<string, number>();
  for (const field of fieldDefs) {
    const gKey = groupKeyOf(field.key);
    if (!rowIndex.has(gKey)) {
      rowIndex.set(gKey, rows.length);
      rows.push({ groupKey: gKey, fields: [] });
    }
    rows[rowIndex.get(gKey)!].fields.push(field);
  }

  return (
    <div className="space-y-2" style={{ flexShrink: 0 }}>
      <div
        ref={canvasRef}
        tabIndex={0}
        onPaste={handlePaste}
        onKeyDown={(e) => {
          if ((e.key === "Delete" || e.key === "Backspace") && selectedImageId) {
            e.preventDefault();
            onImageAdd();
            handleDeleteSelectedImage();
          }
        }}
        onPointerDown={() => setSelectedImageId(null)}
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          position: "relative",
          overflow: "hidden",
          background,
          borderRadius: 8,
          userSelect: "none",
          fontFamily: `'${SLIDE_FONT_FAMILY}', sans-serif`,
          fontSynthesis: "weight",
          outline: "none",
        }}
      >
        {SLIDE_HEADER[slide.id] && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: SLIDE_HEADER[slide.id].height * SCALE,
              background: SLIDE_HEADER[slide.id].color,
              pointerEvents: "none",
            }}
          />
        )}
        {fixedImages.map((img, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- 편집용 캔버스라 고정 크기 배경 이미지, next/image 최적화 불필요
          <img
            key={i}
            src={img.src}
            alt=""
            style={{
              position: "absolute",
              top: img.top * SCALE,
              left: img.left * SCALE,
              width: img.width * SCALE,
              pointerEvents: "none",
            }}
          />
        ))}
        {images.map((img) => (
          <div
            key={img.id}
            style={{
              position: "absolute",
              top: img.top * SCALE,
              left: img.left * SCALE,
              width: img.width * SCALE,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 편집용 캔버스, next/image 최적화 불필요 */}
            <img
              src={img.src}
              alt=""
              onPointerDown={(e) => handleImagePointerDown(e, img, "move")}
              onPointerMove={handleImagePointerMove}
              onPointerUp={handleImagePointerUp}
              style={{
                display: "block",
                width: "100%",
                cursor: "grab",
                touchAction: "none",
                outline: selectedImageId === img.id ? "2px dashed #ff5a5f" : "2px dashed transparent",
              }}
            />
            {selectedImageId === img.id && (
              <div
                onPointerDown={(e) => handleImagePointerDown(e, img, "resize")}
                onPointerMove={handleImagePointerMove}
                onPointerUp={handleImagePointerUp}
                style={{
                  position: "absolute",
                  bottom: -8,
                  right: -8,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "#ff5a5f",
                  cursor: "nwse-resize",
                  touchAction: "none",
                }}
              />
            )}
          </div>
        ))}
        {rows.map((row) => {
        const leadKey = row.fields[0].key;
        const leadStyle = layout[leadKey];
        const textAlign = leadStyle.textAlign ?? "left";
        const isSingle = row.fields.length === 1;
        return (
          <div
            key={row.groupKey}
            onPointerDown={(e) => {
              setSelectedImageId(null);
              handlePointerDown(e, leadKey);
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{
              position: "absolute",
              top: leadStyle.top * SCALE,
              left: textAlign === "center" ? 0 : leadStyle.left * SCALE,
              right: textAlign === "center" ? 0 : undefined,
              width: textAlign === "center" ? "100%" : "auto",
              display: isSingle ? "block" : "flex",
              textAlign: isSingle ? textAlign : undefined,
              justifyContent: textAlign === "center" ? "center" : "flex-start",
              alignItems: "baseline",
              gap: isSingle ? 0 : Math.round(leadStyle.fontSize * 0.3 * SCALE),
              cursor: "grab",
              padding: 2,
              outline: selectedKey && row.fields.some((f) => f.key === selectedKey)
                ? "2px dashed #ff5a5f"
                : "2px dashed transparent",
              touchAction: "none",
            }}
          >
            {row.fields.map((field) => {
              const style = layout[field.key];
              return (
                <span
                  key={field.key}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    handlePointerDown(e, leadKey, field.key);
                  }}
                  style={{
                    fontSize: style.fontSize * SCALE,
                    color: style.color ?? "#000",
                    backgroundColor: style.backgroundColor,
                    fontWeight: style.fontWeight ?? 500,
                    lineHeight: 1.19,
                    whiteSpace: "pre-wrap",
                  }}
                  dangerouslySetInnerHTML={{ __html: escapeHtmlWithBr(content[field.key] ?? "") }}
                />
              );
            })}
          </div>
        );
      })}
      </div>
      <div className="flex items-center gap-2" style={{ width: CANVAS_WIDTH }}>
        <label
          className={`px-2.5 py-1 rounded text-xs border cursor-pointer ${
            uploading ? "text-gray-300 border-gray-200" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          {uploading ? "업로드 중..." : "이미지 추가"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void addImageFromFile(file);
              e.target.value = "";
            }}
          />
        </label>
        {selectedImageId && (
          <button
            type="button"
            onClick={() => {
              onImageAdd();
              handleDeleteSelectedImage();
            }}
            className="px-2.5 py-1 rounded text-xs border text-red-600 hover:bg-red-50"
          >
            선택한 이미지 삭제
          </button>
        )}
        <span className="text-xs text-gray-400">
          캔버스를 클릭하고 이미지를 Ctrl+V로 붙여넣거나, 위 버튼으로 파일을 선택하세요.
        </span>
      </div>
    </div>
  );
}

function FieldEditorPanel({
  label,
  value,
  layout,
  onValueChange,
  onLayoutChange,
  onBeginEdit,
}: {
  label: string;
  value: string;
  layout: LectureFieldLayout;
  onValueChange: (value: string) => void;
  onLayoutChange: (patch: Partial<LectureFieldLayout>) => void;
  /** 입력창이 포커스를 받아 수정을 시작하는 시점(undo 스냅샷을 찍는 시점). */
  onBeginEdit: () => void;
}) {
  return (
    <div className="border rounded-lg p-4 space-y-4 bg-blue-50/40">
      <div className="text-sm font-semibold text-gray-700">{label} 편집</div>

      <div>
        <div className="text-xs text-gray-500 mb-1">텍스트</div>
        <textarea
          className="w-full border rounded px-2.5 py-1.5 text-sm"
          rows={2}
          value={value}
          onFocus={onBeginEdit}
          onChange={(e) => onValueChange(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <div className="text-xs text-gray-500 mb-1">top (세로 위치)</div>
          <input
            type="number"
            className="w-full border rounded px-2 py-1 text-sm"
            value={layout.top}
            onFocus={onBeginEdit}
            onChange={(e) => onLayoutChange({ top: Number(e.target.value) })}
          />
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">left (가로 위치)</div>
          <input
            type="number"
            className="w-full border rounded px-2 py-1 text-sm"
            value={layout.left}
            onFocus={onBeginEdit}
            onChange={(e) => onLayoutChange({ left: Number(e.target.value) })}
          />
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">글자 크기</div>
          <input
            type="number"
            className="w-full border rounded px-2 py-1 text-sm"
            value={layout.fontSize}
            onFocus={onBeginEdit}
            onChange={(e) => onLayoutChange({ fontSize: Number(e.target.value) })}
          />
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">색상</div>
          <input
            type="color"
            className="w-full border rounded h-9"
            value={layout.color ?? "#000000"}
            onFocus={onBeginEdit}
            onChange={(e) => onLayoutChange({ color: e.target.value })}
          />
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1 flex items-center justify-between">
            <span>형광펜 배경</span>
            {layout.backgroundColor && (
              <button
                type="button"
                className="text-blue-600 hover:underline"
                onClick={() => {
                  onBeginEdit();
                  onLayoutChange({ backgroundColor: undefined });
                }}
              >
                지우기
              </button>
            )}
          </div>
          <input
            type="color"
            className="w-full border rounded h-9"
            value={layout.backgroundColor ?? "#ffffff"}
            onFocus={onBeginEdit}
            onChange={(e) => onLayoutChange({ backgroundColor: e.target.value })}
          />
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">정렬</div>
          <select
            className="w-full border rounded px-2 py-1 text-sm"
            value={layout.textAlign ?? "left"}
            onFocus={onBeginEdit}
            onChange={(e) =>
              onLayoutChange({ textAlign: e.target.value as LectureFieldLayout["textAlign"] })
            }
          >
            <option value="left">왼쪽</option>
            <option value="center">가운데</option>
            <option value="right">오른쪽</option>
          </select>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">굵기</div>
          <select
            className="w-full border rounded px-2 py-1 text-sm"
            value={layout.fontWeight ?? 500}
            onFocus={onBeginEdit}
            onChange={(e) => onLayoutChange({ fontWeight: Number(e.target.value) })}
          >
            <option value={500}>Medium</option>
            <option value={700}>Bold</option>
          </select>
        </div>
      </div>
    </div>
  );
}

type SlideSnapshot = {
  content: Record<string, string>;
  layout: Record<string, LectureFieldLayout>;
  images: LectureImagePlacement[];
};

/** undo 스택 최대 깊이. 무한정 쌓이지 않게 제한한다. */
const MAX_HISTORY = 50;

export function LectureMaterialsTab() {
  const [deckId, setDeckId] = useState<string>(DECKS[0].id);
  const [slides, setSlides] = useState<LectureSlide[]>([]);
  const [editingContent, setEditingContent] = useState<Record<string, Record<string, string>>>({});
  const [editingLayout, setEditingLayout] = useState<
    Record<string, Record<string, LectureFieldLayout>>
  >({});
  const [editingImages, setEditingImages] = useState<
    Record<string, LectureImagePlacement[]>
  >({});
  const [selectedField, setSelectedField] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** 슬라이드 id -> undo 스택(직전 상태들). Ctrl+Z를 누르면 맨 위 항목을 꺼내
   *  현재 상태로 되돌린다. 상태(state) 자체가 아니라 ref로 관리해 매 렌더마다
   *  재생성되지 않게 한다. */
  const historyRef = useRef<Record<string, SlideSnapshot[]>>({});
  const editingContentRef = useRef(editingContent);
  const editingLayoutRef = useRef(editingLayout);
  const editingImagesRef = useRef(editingImages);
  editingContentRef.current = editingContent;
  editingLayoutRef.current = editingLayout;
  editingImagesRef.current = editingImages;

  function pushHistory(slideId: string) {
    const stack = historyRef.current[slideId] ?? [];
    const snapshot: SlideSnapshot = {
      content: { ...editingContentRef.current[slideId] },
      layout: { ...editingLayoutRef.current[slideId] },
      images: [...(editingImagesRef.current[slideId] ?? [])],
    };
    const next = [...stack, snapshot];
    if (next.length > MAX_HISTORY) next.shift();
    historyRef.current[slideId] = next;
  }

  function undo(slideId: string) {
    const stack = historyRef.current[slideId];
    if (!stack || stack.length === 0) return;
    const previous = stack[stack.length - 1];
    historyRef.current[slideId] = stack.slice(0, -1);
    setEditingContent((prev) => ({ ...prev, [slideId]: previous.content }));
    setEditingLayout((prev) => ({ ...prev, [slideId]: previous.layout }));
    setEditingImages((prev) => ({ ...prev, [slideId]: previous.images }));
    setMessage(null);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchLectureSlides(deckId)
      .then((data) => {
        if (cancelled) return;
        setSlides(data);
        const initContent: Record<string, Record<string, string>> = {};
        const initLayout: Record<string, Record<string, LectureFieldLayout>> = {};
        const initImages: Record<string, LectureImagePlacement[]> = {};
        for (const slide of data) {
          initContent[slide.id] = { ...slide.content };
          const fieldDefs = SLIDE_FIELD_DEFS[slide.id] ?? [];
          initLayout[slide.id] = mergeLayout(slide, fieldDefs);
          initImages[slide.id] = slide.images ?? [];
        }
        setEditingContent(initContent);
        setEditingLayout(initLayout);
        setEditingImages(initImages);
        setSelectedField({});
        historyRef.current = {};
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "불러오기 실패");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  /** Ctrl+Z(맥 Cmd+Z)로 현재 선택된 필드가 속한 슬라이드를 되돌린다.
   *  input/textarea 포커스 중에는 브라우저 기본 텍스트 undo가 자연스럽게
   *  동작하도록 가로채지 않는다. */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z";
      if (!isUndo) return;
      const target = e.target as HTMLElement | null;
      const isEditableTarget =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (isEditableTarget) return;
      e.preventDefault();
      for (const slide of slides) {
        if (historyRef.current[slide.id]?.length) {
          undo(slide.id);
          break;
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [slides]);

  function isDirty(slide: LectureSlide) {
    const content = editingContent[slide.id];
    const layout = editingLayout[slide.id];
    const images = editingImages[slide.id];
    if (!content || !layout) return false;
    const fieldDefs = SLIDE_FIELD_DEFS[slide.id] ?? [];
    const baseline = mergeLayout(slide, fieldDefs);
    return (
      JSON.stringify(content) !== JSON.stringify(slide.content) ||
      JSON.stringify(layout) !== JSON.stringify(baseline) ||
      JSON.stringify(images ?? []) !== JSON.stringify(slide.images ?? [])
    );
  }

  async function handleSave(slide: LectureSlide) {
    const content = editingContent[slide.id];
    const layout = editingLayout[slide.id];
    const images = editingImages[slide.id] ?? [];
    if (!content || !layout) return;
    setSavingId(slide.id);
    setError(null);
    try {
      const updated = await updateLectureSlide(slide.id, { content, layout, images });
      setSlides((prev) => prev.map((s) => (s.id === slide.id ? updated : s)));
      setMessage(`"${slide.label}" 저장 완료`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSavingId(null);
    }
  }

  function handleReset(slide: LectureSlide) {
    pushHistory(slide.id);
    const fieldDefs = SLIDE_FIELD_DEFS[slide.id] ?? [];
    setEditingContent((prev) => ({ ...prev, [slide.id]: { ...slide.content } }));
    setEditingLayout((prev) => ({ ...prev, [slide.id]: mergeLayout(slide, fieldDefs) }));
    setEditingImages((prev) => ({ ...prev, [slide.id]: slide.images ?? [] }));
    setMessage(null);
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">불러오는 중...</div>;
  }

  if (error && slides.length === 0) {
    return <div className="p-6 text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="p-6 space-y-8">
      <style>{SLIDE_FONT_CSS}</style>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">강의자료 — 웨비나 슬라이드</h2>
          <p className="text-sm text-gray-500 mt-1">
            미리보기 안의 텍스트를 드래그해서 위치를 옮기고, 클릭하면 아래에서 텍스트·글자크기·색상을 수정할 수 있습니다.
            변경을 한 단계씩 취소하려면 Ctrl+Z(Mac: Cmd+Z)를 누르세요.
          </p>
        </div>
        <select
          className="border rounded px-3 py-2 text-sm font-medium bg-white shrink-0"
          value={deckId}
          onChange={(e) => setDeckId(e.target.value)}
        >
          {DECKS.map((deck) => (
            <option key={deck.id} value={deck.id}>
              {deck.label}
            </option>
          ))}
        </select>
      </div>

      {message && (
        <div className="rounded bg-green-50 text-green-700 text-sm px-3 py-2">{message}</div>
      )}
      {error && (
        <div className="rounded bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>
      )}

      {slides.map((slide) => {
        const fieldDefs = SLIDE_FIELD_DEFS[slide.id] ?? [];
        const content = editingContent[slide.id] ?? {};
        const layout = editingLayout[slide.id] ?? {};
        const dirty = isDirty(slide);
        const selKey = selectedField[slide.id] ?? null;
        const selDef = fieldDefs.find((f) => f.key === selKey);

        return (
          <div key={slide.id} className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm">{slide.label}</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!dirty}
                  onClick={() => handleReset(slide)}
                  className={`px-3 py-1.5 rounded text-xs font-medium border ${
                    dirty
                      ? "text-gray-600 hover:bg-gray-50"
                      : "text-gray-300 cursor-not-allowed"
                  }`}
                  title="마지막 저장 상태로 전체 되돌리기"
                >
                  전체 되돌리기
                </button>
                <button
                  type="button"
                  disabled={!dirty || savingId === slide.id}
                  onClick={() => handleSave(slide)}
                  className={`px-4 py-1.5 rounded text-sm font-medium ${
                    dirty
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  {savingId === slide.id ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-6 items-start">
              <EditableSlideCanvas
                slide={slide}
                content={content}
                layout={layout}
                images={editingImages[slide.id] ?? []}
                selectedKey={selKey}
                onSelect={(key) =>
                  setSelectedField((prev) => ({ ...prev, [slide.id]: key }))
                }
                onLayoutChange={(key, patch) => {
                  setEditingLayout((prev) => ({
                    ...prev,
                    [slide.id]: {
                      ...prev[slide.id],
                      [key]: { ...prev[slide.id][key], ...patch },
                    },
                  }));
                  setMessage(null);
                }}
                onDragStart={() => pushHistory(slide.id)}
                onImagesChange={(images) => {
                  setEditingImages((prev) => ({ ...prev, [slide.id]: images }));
                  setMessage(null);
                }}
                onImageAdd={() => pushHistory(slide.id)}
              />

              <div className="w-full md:flex-1 md:min-w-[320px] md:max-w-md space-y-3">
                <div className="text-xs text-gray-400">
                  필드를 클릭해서 선택하거나, 캔버스에서 직접 드래그하세요.
                  캔버스를 클릭한 뒤 이미지를 복사해서 <strong>Ctrl+V</strong>로 붙여넣을 수 있습니다.
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {fieldDefs.map((field) => (
                    <button
                      key={field.key}
                      type="button"
                      onClick={() =>
                        setSelectedField((prev) => ({ ...prev, [slide.id]: field.key }))
                      }
                      className={`px-2.5 py-1 rounded text-xs border ${
                        selKey === field.key
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {field.label}
                    </button>
                  ))}
                </div>

                {selDef && (
                  <FieldEditorPanel
                    key={selDef.key}
                    label={selDef.label}
                    value={content[selDef.key] ?? ""}
                    layout={layout[selDef.key]}
                    onBeginEdit={() => pushHistory(slide.id)}
                    onValueChange={(value) => {
                      setEditingContent((prev) => ({
                        ...prev,
                        [slide.id]: { ...prev[slide.id], [selDef.key]: value },
                      }));
                      setMessage(null);
                    }}
                    onLayoutChange={(patch) => {
                      setEditingLayout((prev) => ({
                        ...prev,
                        [slide.id]: {
                          ...prev[slide.id],
                          [selDef.key]: { ...prev[slide.id][selDef.key], ...patch },
                        },
                      }));
                      setMessage(null);
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
