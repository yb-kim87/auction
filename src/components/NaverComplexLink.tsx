export function naverComplexUrl(naverId: string | null | undefined): string | null {
  const id = String(naverId ?? "").trim();
  if (!/^\d+$/.test(id)) return null;
  return `https://new.land.naver.com/complexes/${id}`;
}

export function NaverComplexLink({
  naverId,
  title = "네이버 부동산 단지정보 보기",
  compact = false,
  inLabelRow = false,
}: {
  naverId?: string | null;
  title?: string;
  compact?: boolean;
  inLabelRow?: boolean;
}) {
  const href = naverComplexUrl(naverId);
  if (!href) return null;

  return (
    <a
      href={href}
      title={title}
      aria-label={title}
      className={`inline-flex shrink-0 items-center justify-center font-medium rounded-sm border border-[#03C75A]/30 bg-[#03C75A]/10 text-[#03C75A] hover:bg-[#03C75A]/20 hover:underline cursor-pointer transition-colors whitespace-nowrap ${
        inLabelRow
          ? "h-[22px] px-1.5 text-[11px] leading-none"
          : compact
            ? "px-1.5 py-0.5 text-[12px] leading-tight"
            : "px-2 py-0.5 text-[13px] leading-snug"
      }`}
      onClick={(e) => {
        // 탭이 아니라 새 창으로 열리게 한다(사용자 요청, 2026-08-04) —
        // target="_blank"는 브라우저 설정에 따라 새 탭으로 열리므로,
        // window.open에 크기를 지정해 별도 창으로 강제한다.
        e.preventDefault();
        e.stopPropagation();
        window.open(href, "naver-complex-info", "noopener,noreferrer,width=1100,height=900");
      }}
    >
      N단지정보
    </a>
  );
}
