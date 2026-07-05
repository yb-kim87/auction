import Link from "next/link";
import { Search } from "lucide-react";
import type { ReactNode } from "react";

export const HEADER_TEXT = "text-[16px] leading-snug";
export const HEADER_TITLE = `${HEADER_TEXT} text-[#222222] font-semibold tracking-wide whitespace-nowrap`;
export const HEADER_MUTED = `${HEADER_TEXT} text-[#222222]/55`;
export const HEADER_ACCENT_BAR = "w-1 h-5 bg-primary rounded-full shrink-0";
export const HEADER_BTN =
  `text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-[0.5rem] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors`;
export const HEADER_TAB_ACTIVE =
  `text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-[0.5rem] font-semibold text-primary bg-secondary`;
export const HEADER_NAV_TRAILING = "ml-auto flex items-center gap-3 shrink-0";

type AppHeaderProps = {
  maxWidth?: "960" | "1400" | "1600";
  nav?: ReactNode;
};

export function AppHeader({ maxWidth = "1600", nav }: AppHeaderProps) {
  const maxW =
    maxWidth === "960" ? "max-w-[960px]" : maxWidth === "1400" ? "max-w-[1400px]" : "max-w-[1600px]";

  return (
    <header className="h-14 bg-white border-b border-border sticky top-0 z-50">
      <div className={`${maxW} h-full mx-auto px-3 sm:px-6 flex items-center gap-2 sm:gap-6`}>
        <Link href="/" className="flex items-center gap-2.5 shrink-0" aria-label="경매코치 홈">
          <div className="w-7 h-7 bg-primary flex items-center justify-center shrink-0" style={{ borderRadius: "0.5rem" }}>
            <Search className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-foreground text-[0.9rem] tracking-tight whitespace-nowrap">
            코치경매
          </span>
        </Link>

        {nav && (
          <nav className="flex flex-1 items-center gap-1 min-w-0 flex-nowrap overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {nav}
          </nav>
        )}
      </div>
    </header>
  );
}
