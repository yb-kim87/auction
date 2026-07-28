import type { AuctionItem, UpdateAuctionPayload } from "@/types/auction";
import { displayTenantDetail } from "@/lib/tenant-status";

export type FieldDef = {
  key: keyof UpdateAuctionPayload;
  label: string;
  type?: "text" | "number" | "textarea" | "checkbox";
  full?: boolean;
  /** type이 checkbox일 때 체크박스 옆에 보여줄 안내 문구 */
  checkboxHint?: string;
};

export const AUCTION_FIELD_GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: "경매 기본정보",
    fields: [
      { key: "memo", label: "메모", type: "textarea" },
      { key: "auctionNo", label: "사건번호" },
      { key: "owner", label: "현재 소유자" },
      { key: "appraiser", label: "감정평가 기관" },
      { key: "link", label: "원문 물건 페이지" },
      { key: "views", label: "조회수", type: "number" },
      { key: "address", label: "물건 소재지", full: true },
    ],
  },
  {
    title: "건물·면적 정보",
    fields: [
      { key: "usage", label: "건물 용도" },
      { key: "area", label: "전용면적" },
      { key: "landShare", label: "대지권·토지 지분" },
      { key: "builtYear", label: "사용승인 연도", type: "number" },
      { key: "totalUnits", label: "단지 전체 세대수", type: "number" },
      { key: "elevator", label: "엘리베이터" },
      { key: "parking", label: "주차 정보" },
      {
        key: "isRedevelopment",
        label: "재개발 대상 여부",
        type: "checkbox",
        checkboxHint: "재개발 물건이면 체크",
      },
      { key: "education", label: "주변 교육시설", type: "textarea", full: true },
    ],
  },
  {
    title: "가격·시세 정보",
    fields: [
      { key: "appraisedValue", label: "감정가", type: "number" },
      { key: "minPrice", label: "현재 최저 입찰가", type: "number" },
      { key: "naverPrice", label: "주변 매물 호가", type: "number" },
      { key: "officialLandPrice", label: "공시가격", type: "number" },
      { key: "salePrice", label: "실제 낙찰가", type: "number" },
      { key: "tradingCount", label: "최근 실거래 건수" },
      { key: "priceDetail", label: "주변 매물 상세", full: true },
      { key: "tradingDetail", label: "최근 실거래 상세", full: true },
    ],
  },
  {
    title: "등기·임차인 정보",
    fields: [
      { key: "tenantInfo", label: "임차인 요약" },
      { key: "buildingRegistry", label: "건물 등기 권리내역", type: "textarea", full: true },
      { key: "tenantDetail", label: "임차인·점유 현황", full: true },
      { key: "unpaidFeeAmount", label: "미납 관리비", type: "number" },
      { key: "unpaidFeeNote", label: "미납 관리비 조사 내용" },
    ],
  },
  {
    title: "입찰 및 진행 상태",
    fields: [
      { key: "bidDate", label: "다음 입찰일" },
      { key: "bidInfo", label: "입찰 진행 내역", full: true },
      { key: "recordTime", label: "정보 확인 시각" },
    ],
  },
];

export const EMPTY_AUCTION_FORM: UpdateAuctionPayload = {
  memo: "",
  link: "",
  views: 0,
  auctionNo: "",
  address: "",
  totalUnits: 0,
  usage: "",
  area: "",
  builtYear: 0,
  bidDate: "",
  appraisedValue: 0,
  minPrice: 0,
  salePrice: null,
  naverPrice: 0,
  naverId: "",
  diffNaverSale: null,
  diffNaverMin: 0,
  diffNaverAppraised: 0,
  elevator: "",
  parking: "",
  landShare: "",
  buildingRegistry: "",
  education: "",
  tradingCount: "",
  bidInfo: "",
  owner: "",
  appraiser: "",
  officialLandPrice: 0,
  tenantInfo: "",
  specialNote: "",
  unpaidFeeAmount: 0,
  unpaidFeeNote: "",
  unpaidFeeCheckedAt: "",
  tenantDetail: "",
  priceDetail: "",
  tradingDetail: "",
  recordTime: "",
  isRedevelopment: false,
};

export function toFormState(item: AuctionItem): UpdateAuctionPayload {
  const {
    id: _id,
    city: _c,
    district: _d,
    propType: _p,
    status: _s,
    submittedBy: _b,
    isUpdated: _u,
    updatedAt: _a,
    updatedBy: _ub,
    ...rest
  } = item;
  return {
    ...rest,
    tenantDetail: displayTenantDetail(rest.tenantDetail) || rest.tenantDetail,
  };
}

export function toPayload(form: UpdateAuctionPayload): UpdateAuctionPayload {
  const num = (v: string | number) => {
    const n = Number(String(v).replace(/,/g, "").trim());
    return Number.isFinite(n) ? Math.round(n) : 0;
  };
  const parseBuiltYearInput = (v: string | number) => {
    const str = String(v ?? "").trim();
    if (!str || str === "-") return 0;
    const yearMatch = str.match(/(?:19|20)\d{2}/);
    if (yearMatch) return parseInt(yearMatch[0], 10);
    return num(v);
  };
  const numOrNull = (v: string | number | null) => {
    const cleaned = String(v ?? "").replace(/,/g, "").trim();
    if (!cleaned || cleaned === "-") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? Math.round(n) : null;
  };

  return {
    ...form,
    views: num(form.views),
    totalUnits: num(form.totalUnits),
    builtYear: parseBuiltYearInput(form.builtYear),
    appraisedValue: num(form.appraisedValue),
    minPrice: num(form.minPrice),
    salePrice: numOrNull(form.salePrice),
    naverPrice: num(form.naverPrice),
    officialLandPrice: num(form.officialLandPrice),
    isRedevelopment: form.isRedevelopment === true || (form.isRedevelopment as unknown) === "true",
  };
}
