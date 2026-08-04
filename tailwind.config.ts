import type { Config } from "tailwindcss";

/** 테마 색상은 --primary: #1e3a5f 처럼 완성된 색(hex/oklch 등)을 담은
 * CSS 변수라서, Tailwind의 기본 투명도 처리 방식인 rgb(var(--x) / 0.35)
 * 로는 조합이 안 된다("rgb(#1e3a5f / 0.35)"는 잘못된 CSS라 브라우저가
 * 선언 자체를 버려 완전 투명해진다 — 실측, 2026-08-05: "실거래 그래프가
 * 제대로 안나오는데" → bg-primary/35 막대가 rgba(0,0,0,0)으로 렌더링됨
 * 확인). color-mix()는 hex/oklch 등 어떤 표기든 그대로 섞을 수 있어
 * 이 문제가 없다 — 투명도 없이 쓰는 기존 bg-primary 등은 그대로
 * var(--x)를 반환해 영향이 없다. */
function withOpacity(variable: string) {
  return ({ opacityValue }: { opacityValue?: string }) => {
    // 수정자 없는 기본 유틸(예: bg-primary)에서는 Tailwind가 opacityValue로
    // "<alpha-value>"/CSS 변수 참조 같은 숫자 아닌 문자열을 넘긴다 —
    // Number()로 바로 곱하면 NaN%가 돼 색이 통째로 깨진다(실측 사고,
    // 2026-08-05: 이 함수를 처음 넣은 배포에서 .bg-primary 자체가
    // "color-mix(in srgb,var(--primary) NaN%,transparent)"로 나옴).
    // 유한한 숫자일 때만 color-mix를 쓰고, 그 외엔 항상 순수 var(--x).
    const n = Number(opacityValue);
    return Number.isFinite(n) ? `color-mix(in srgb, var(${variable}) ${n * 100}%, transparent)` : `var(${variable})`;
  };
}

// Tailwind는 런타임에 색상 값으로 함수(opacityValue 콜백)를 받아들이지만
// 설치된 @types 버전의 Config 타입 정의가 이를 표현하지 못해 색상 값을
// 문자열로만 좁게 선언한다 — 여기서만 as unknown으로 우회한다.
const config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: withOpacity("--background"),
        foreground: withOpacity("--foreground"),
        card: {
          DEFAULT: withOpacity("--card"),
          foreground: withOpacity("--card-foreground"),
        },
        popover: {
          DEFAULT: withOpacity("--popover"),
          foreground: withOpacity("--popover-foreground"),
        },
        primary: {
          DEFAULT: withOpacity("--primary"),
          foreground: withOpacity("--primary-foreground"),
        },
        secondary: {
          DEFAULT: withOpacity("--secondary"),
          foreground: withOpacity("--secondary-foreground"),
        },
        muted: {
          DEFAULT: withOpacity("--muted"),
          foreground: withOpacity("--muted-foreground"),
        },
        accent: {
          DEFAULT: withOpacity("--accent"),
          foreground: withOpacity("--accent-foreground"),
        },
        destructive: {
          DEFAULT: withOpacity("--destructive"),
          foreground: withOpacity("--destructive-foreground"),
        },
        border: withOpacity("--border"),
        input: withOpacity("--input"),
        "input-background": withOpacity("--input-background"),
        "switch-background": withOpacity("--switch-background"),
        ring: withOpacity("--ring"),
        chart: {
          1: withOpacity("--chart-1"),
          2: withOpacity("--chart-2"),
          3: withOpacity("--chart-3"),
          4: withOpacity("--chart-4"),
          5: withOpacity("--chart-5"),
        },
        sidebar: {
          DEFAULT: withOpacity("--sidebar"),
          foreground: withOpacity("--sidebar-foreground"),
          primary: withOpacity("--sidebar-primary"),
          "primary-foreground": withOpacity("--sidebar-primary-foreground"),
          accent: withOpacity("--sidebar-accent"),
          "accent-foreground": withOpacity("--sidebar-accent-foreground"),
          border: withOpacity("--sidebar-border"),
          ring: withOpacity("--sidebar-ring"),
        },
      },
      borderRadius: {
        sm: "calc(var(--radius) - 4px)",
        md: "calc(var(--radius) - 2px)",
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 4px)",
      },
    },
  },
  plugins: [],
} as unknown as Config;
export default config;
