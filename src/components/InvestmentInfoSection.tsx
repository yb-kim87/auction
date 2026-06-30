import type { ReactNode } from "react";

type InvestmentInfoSectionProps = {
  children: ReactNode;
  className?: string;
};

export function InvestmentInfoSection({
  children,
  className = "",
}: InvestmentInfoSectionProps) {
  return (
    <section
      className={`rounded-xl border border-border bg-secondary/25 p-4 sm:p-5 space-y-4 ${className}`}
    >
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">투자정보</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          아래 자료를 기반으로 물건이 추천될 예정이니 정확하게 기입하여 주시기 바랍니다.
        </p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
