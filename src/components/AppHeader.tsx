import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export const HEADER_TEXT = "text-[16px] leading-snug";
export const HEADER_TITLE = `${HEADER_TEXT} text-[#222222] font-semibold tracking-wide whitespace-nowrap`;
export const HEADER_MUTED = `${HEADER_TEXT} text-[#222222]/55`;
export const HEADER_ACCENT_BAR = "w-1 h-5 bg-primary rounded-full shrink-0";
export const HEADER_BTN =
  `${HEADER_TEXT} flex items-center gap-1.5 px-3 py-1.5 font-medium text-[#222222] rounded-sm hover:text-primary transition-colors`;
export const HEADER_NAV_TRAILING = "ml-auto flex items-center gap-3 shrink-0";

type AppHeaderProps = {
  maxWidth?: "960" | "1600";
  nav?: ReactNode;
};

export function AppHeader({ maxWidth = "1600", nav }: AppHeaderProps) {
  const maxW = maxWidth === "960" ? "max-w-[960px]" : "max-w-[1600px]";

  return (
    <header className="bg-white border-b border-primary sticky top-0 z-50">
      <div className={`${maxW} mx-auto px-3 sm:px-6 py-1 flex items-center gap-2 sm:gap-5`}>
        <Link href="/" className="shrink-0" aria-label="경매코치 홈">
          <Image
            src="/logo.png"
            alt="경매코치"
            width={240}
            height={96}
            className="h-12 sm:h-20 w-auto object-contain"
            priority
          />
        </Link>

        {nav && (
          <nav className="flex flex-1 items-center gap-2 sm:gap-4 min-w-0 flex-wrap">{nav}</nav>
        )}
      </div>
    </header>
  );
}
