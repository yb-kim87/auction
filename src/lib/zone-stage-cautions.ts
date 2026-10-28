import { stagePosition } from "./zone-progress";

export type ZoneStageCaution = { id: string; title: string; description: string; sourceUrl?: string };

/** 저장된 사업종류·단계로 보여주는 확인 알림. 규제 지정이나 권리관계를 확정하지 않는다. */
export function zoneStageCautions(businessType: string, stage: string | null | undefined): ZoneStageCaution[] {
  if (businessType === "도심공공복합") return [{
    id: "public-complex-rights", title: "3080+ 도심 공공주택 복합사업: 권리승계 확인",
    description: "권리산정기준일 이후 취득 시 현물보상 권리와 현금청산 위험을 확인하세요. 일괄적으로 승계 불가라고 단정할 수 없으며, 지구별 승계 가능 기간과 취득 방식·권리관계를 LH 등 사업시행자에게 확인해야 합니다.",
    sourceUrl: "https://lh.or.kr/boardDownload.es?bid=0033&list_no=732590&seq=2",
  }];
  if (businessType === "공공재개발") return [{
    id: "public-redevelopment-rights", title: "공공재개발 권리산정기준 확인",
    description: "일반 공공재개발은 3080+ 도심 공공주택 복합사업과 구분됩니다. 도심복합사업의 승계 제한을 일률적으로 적용하지 않지만, 권리산정기준일·지분 분할·조합원 자격 등 해당 구역과 물건의 권리는 별도로 확인하세요.",
    sourceUrl: "https://www.molit.go.kr/3080/main.jsp",
  }];
  if (businessType !== "신통기획" && businessType !== "모아타운") return [];
  const normalized = (stage ?? "").replace(/\s+/g, "");
  const position = stagePosition(stage);
  const selected = (position != null && position >= 2) || /대상지선정|후보지선정|기획완료|관리계획수립|공람|열람/.test(normalized);
  // 추진위 승인·창립총회·시공사 선정·사업시행자 지정만으로 조합설립인가를 단정하지 않는다.
  const implementation = /사업시행(?:계획)?인가|사업계획승인|관리처분인가|이주|철거|착공|준공|청산|해산/.test(normalized);
  const association = /조합설립(?:변경)?인가/.test(normalized) || implementation;
  const cautions: ZoneStageCaution[] = [];
  if (businessType === "신통기획" && selected) {
    cautions.push({ id: "land-permit", title: "토지거래허가구역 확인", description: "대상지 선정 이후 허가구역 지정 여부와 일반 매수 시 허가 필요 여부를 확인하세요. 민사집행법에 따른 경매 취득은 토지거래계약 허가 대상에서 제외됩니다.", sourceUrl: "https://land.seoul.go.kr/land/other/contractGuide.do" });
  }
  if (association && businessType === "모아타운") {
    cautions.push({ id: "regulated-transfer", title: "투기과열지구인 경우 조합원 지위 승계 제한", description: "가로주택 등 해당 소규모정비사업에서는 조합설립인가 이후 조합원 지위 승계가 원칙적으로 제한될 수 있습니다. 실제 사업방식·투기과열지구 지정 여부와 법정 예외를 확인하세요.", sourceUrl: "https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1033742575" });
  }
  if (association && businessType === "모아타운") {
    cautions.push({ id: "auction-creditor", title: "투기과열지구 경매: 채권자와 예외 확인", description: "조합설립인가 후 경매라면 신청 채권자와 채무의 발생·승계 관계를 확인하세요. 법령상 국가·지자체 또는 정해진 금융기관 채무 불이행에 따른 경매는 예외가 될 수 있습니다. 개인·대부업체 채권은 이 금융기관 예외에 해당하는지 확인이 필요하며, 다른 법정 예외도 있으므로 채권자만으로 승계 여부를 단정하지 마세요.", sourceUrl: "https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=&lspttninfSeq=177191" });
  }
  if (implementation) {
    cautions.push({ id: "cash-settlement", title: "사업시행인가 이후 현금청산 위험 확인", description: "기존 소유자의 분양신청 여부와 신청기간, 현금청산 대상 여부를 조합 또는 사업시행자에게 확인하세요. 분양신청 여부만으로 권리승계나 현금청산을 확정할 수 없습니다." });
  }
  if (association) {
    cautions.push({ id: "multiple-properties", title: "다물권자 확인 필요", description: "조합설립인가 이후에는 다물권자 여부와 조합원 지위·분양권 승계 가능 여부를 확인하세요. 개별 권리관계와 적용 예외에 따라 결과가 다를 수 있습니다." });
  }
  return cautions;
}
