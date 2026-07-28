import type { AuctionAnalysisResult } from "@/types/auction";

export type RightsTone = "positive" | "caution" | "danger" | "neutral";

export function rightsOnlyRisks(result: AuctionAnalysisResult | null | undefined) {
  return (result?.risks ?? []).filter(
    (risk) => !/미납\s*관리비|관리비[^.\n]*미납/.test(risk),
  );
}

export function rightsPresentation(
  result: AuctionAnalysisResult | null | undefined,
) {
  if (!result) {
    return {
      tone: "neutral" as RightsTone,
      label: "권리분석 전",
      detail: "AI 권리분석이 필요합니다.",
    };
  }
  if (result.stale) {
    return {
      tone: "caution" as RightsTone,
      label: "재확인 필요",
      detail: "물건 정보가 변경되어 권리분석을 다시 확인해야 합니다.",
    };
  }

  const structured = result.structuredRights;
  const noTenantAssumption =
    structured?.tenant.opposability === "none" &&
    structured.assumption.status === "none" &&
    structured.assumption.estimatedAmount === 0;
  const risks = rightsOnlyRisks(result);

  if (noTenantAssumption && risks.length === 0) {
    return {
      tone: "positive" as RightsTone,
      label: "권리상 입찰 검토 가능",
      detail: "대항력 있는 임차인이 없고 예상 인수금액은 0원입니다.",
    };
  }

  const dangerous =
    structured?.assumption.status === "possible" ||
    risks.some((risk) =>
      /(인수|선순위|유치권|법정지상권|대항력|전세권|가처분|가등기)/.test(risk),
    );
  if (dangerous) {
    return {
      tone: "danger" as RightsTone,
      label: "권리위험 높음",
      detail: risks[0] || "낙찰자가 부담할 가능성이 있는 권리를 확인해야 합니다.",
    };
  }

  return {
    tone: "caution" as RightsTone,
    label: "확인 후 입찰 검토",
    detail: risks[0] || "확정되지 않은 권리자료를 확인한 뒤 입찰을 검토하세요.",
  };
}

export function positiveRightsSummary() {
  return "법원 조사자료상 임차내역이 없고 대항력 있는 임차인도 없어 예상 인수금액은 0원으로 판단됩니다. 다만 입찰 전 최신 등기부와 매각물건명세서를 반드시 확인하세요.";
}
