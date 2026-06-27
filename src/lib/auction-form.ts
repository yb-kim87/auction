import type { AuctionItem, UpdateAuctionPayload } from "@/types/auction";

export type FieldDef = {
  key: keyof UpdateAuctionPayload;
  label: string;
  type?: "text" | "number" | "textarea";
  full?: boolean;
};

export const AUCTION_FIELD_GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: "기본 정보",
    fields: [
      { key: "memo", label: "메모" },
      { key: "link", label: "링크" },
      { key: "views", label: "조회수", type: "number" },
      { key: "auctionNo", label: "경매번호" },
      { key: "address", label: "물건주소", full: true },
    ],
  },
  {
    title: "물건 정보",
    fields: [
      { key: "totalUnits", label: "총 세대수", type: "number" },
      { key: "usage", label: "용도" },
      { key: "area", label: "평형" },
      { key: "builtYear", label: "연식", type: "number" },
      { key: "bidDate", label: "입찰기일" },
    ],
  },
  {
    title: "가격 정보",
    fields: [
      { key: "appraisedValue", label: "감정가", type: "number" },
      { key: "minPrice", label: "최저가", type: "number" },
      { key: "salePrice", label: "매각가", type: "number" },
      { key: "naverPrice", label: "네이버 호가", type: "number" },
      { key: "officialLandPrice", label: "공시지가", type: "number" },
      { key: "tradingCount", label: "실거래건수", type: "number" },
    ],
  },
  {
    title: "상세 정보",
    fields: [
      { key: "bidInfo", label: "입찰정보" },
      { key: "owner", label: "소유자" },
      { key: "appraiser", label: "감정원" },
      { key: "tenantInfo", label: "임차정보" },
      { key: "specialNote", label: "특이사항" },
      { key: "elevator", label: "승강기" },
      { key: "parking", label: "주차장" },
      { key: "landShare", label: "토지지분" },
      { key: "buildingRegistry", label: "건물등기" },
      { key: "education", label: "교육환경" },
      { key: "tenantDetail", label: "임차상세", full: true },
      { key: "priceDetail", label: "호가 상세", full: true },
      { key: "tradingDetail", label: "실거래 상세", full: true },
      { key: "recordTime", label: "기록시간" },
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
  diffNaverSale: null,
  diffNaverMin: 0,
  diffNaverAppraised: 0,
  elevator: "",
  parking: "",
  landShare: "",
  buildingRegistry: "",
  education: "",
  tradingCount: 0,
  bidInfo: "",
  owner: "",
  appraiser: "",
  officialLandPrice: 0,
  tenantInfo: "",
  specialNote: "",
  tenantDetail: "",
  priceDetail: "",
  tradingDetail: "",
  recordTime: "",
};

export function toFormState(item: AuctionItem): UpdateAuctionPayload {
  const { id: _id, city: _c, district: _d, propType: _p, status: _s, submittedBy: _b, ...rest } = item;
  return rest;
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
    tradingCount: num(form.tradingCount),
    officialLandPrice: num(form.officialLandPrice),
  };
}
