export type UserRole =
  | "admin"
  | "consultant"
  | "consulting_student"
  | "student"
  | "member";
export type AuctionStatus = "pending" | "approved" | "rejected";

export interface AuctionItem {
  id: string;
  memo: string;
  link: string;
  views: number;
  auctionNo: string;
  address: string;
  totalUnits: number;
  usage: string;
  area: string;
  builtYear: number;
  bidDate: string;
  appraisedValue: number;
  minPrice: number;
  salePrice: number | null;
  naverPrice: number;
  diffNaverSale: number | null;
  diffNaverMin: number;
  diffNaverAppraised: number;
  elevator: string;
  parking: string;
  landShare: string;
  buildingRegistry: string;
  education: string;
  tradingCount: number;
  bidInfo: string;
  owner: string;
  appraiser: string;
  officialLandPrice: number;
  tenantInfo: string;
  specialNote: string;
  tenantDetail: string;
  priceDetail: string;
  tradingDetail: string;
  recordTime: string;
  city: string;
  district: string;
  propType: "아파트" | "빌라";
  status: AuctionStatus;
  submittedBy: string;
}

export type UpdateAuctionPayload = Omit<
  AuctionItem,
  "id" | "city" | "district" | "propType" | "status" | "submittedBy"
>;

export interface UserProfile {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export const STATUS_LABELS: Record<AuctionStatus, string> = {
  pending: "승인대기",
  approved: "승인됨",
  rejected: "반려됨",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "관리자",
  consultant: "컨설턴트",
  consulting_student: "컨설팅 수강생",
  student: "수강생",
  member: "승인대기",
};
