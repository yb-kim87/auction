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
}

export const MOCK_DATA: AuctionItem[] = [
  {
    id: "1", memo: "입지 좋음", link: "https://www.courtauction.go.kr", views: 342,
    auctionNo: "2024타경12345", address: "서울특별시 강남구 대치동 은마아파트 101동 502호",
    totalUnits: 4424, usage: "주거용", area: "34평", builtYear: 1979,
    bidDate: "2025-02-18", appraisedValue: 1450000000, minPrice: 1160000000, salePrice: 1280000000,
    naverPrice: 1550000000, elevator: "비상/승용", parking: "자주식 500대",
    landShare: "35.7㎡", buildingRegistry: "이상없음", education: "대치초, 대치중",
    tradingCount: 14, bidInfo: "3명", owner: "김○○", appraiser: "한국감정원",
    officialLandPrice: 890000000, tenantInfo: "전입 없음", specialNote: "유치권 없음",
    tenantDetail: "-", priceDetail: "22년 3월 1.55억 거래", tradingDetail: "최근 3건",
    recordTime: "2025-01-15 09:22", city: "서울특별시", district: "강남구", propType: "아파트",
  },
  {
    id: "2", memo: "", link: "https://www.courtauction.go.kr", views: 218,
    auctionNo: "2024타경23456", address: "서울특별시 서초구 반포동 래미안퍼스티지 204동 1102호",
    totalUnits: 2444, usage: "주거용", area: "59평", builtYear: 2009,
    bidDate: "2025-02-25", appraisedValue: 3980000000, minPrice: 3184000000, salePrice: null,
    naverPrice: 4200000000, elevator: "비상/승용", parking: "자주식 1200대",
    landShare: "84.5㎡", buildingRegistry: "가압류 1건", education: "원촌초, 서초중",
    tradingCount: 7, bidInfo: "1회 유찰", owner: "이○○", appraiser: "감정평가법인",
    officialLandPrice: 2100000000, tenantInfo: "보증 3억/월 120만", specialNote: "임차인 점유 중",
    tenantDetail: "전세 보증금 3억", priceDetail: "24년 11월 42억 거래", tradingDetail: "최근 2건",
    recordTime: "2025-01-18 14:05", city: "서울특별시", district: "서초구", propType: "아파트",
  },
  {
    id: "3", memo: "재건축 예정", link: "https://www.courtauction.go.kr", views: 567,
    auctionNo: "2024타경34567", address: "서울특별시 강남구 압구정동 현대아파트 7차 803호",
    totalUnits: 856, usage: "주거용", area: "52평", builtYear: 1976,
    bidDate: "2025-03-04", appraisedValue: 5200000000, minPrice: 4160000000, salePrice: null,
    naverPrice: 5800000000, elevator: "승용", parking: "자주식 400대",
    landShare: "105.3㎡", buildingRegistry: "이상없음", education: "압구정초, 압구정중",
    tradingCount: 3, bidInfo: "2명", owner: "박○○", appraiser: "한국감정원",
    officialLandPrice: 3400000000, tenantInfo: "전입 없음", specialNote: "재건축 조합원 자격",
    tenantDetail: "-", priceDetail: "24년 9월 58억 거래", tradingDetail: "최근 1건",
    recordTime: "2025-01-20 10:30", city: "서울특별시", district: "강남구", propType: "아파트",
  },
  {
    id: "4", memo: "", link: "https://www.courtauction.go.kr", views: 89,
    auctionNo: "2024타경45678", address: "경기도 수원시 영통구 망포동 힐스테이트 영통 201동 304호",
    totalUnits: 1248, usage: "주거용", area: "25평", builtYear: 2021,
    bidDate: "2025-02-20", appraisedValue: 420000000, minPrice: 336000000, salePrice: 355000000,
    naverPrice: 445000000, elevator: "비상/승용", parking: "자주식 1600대",
    landShare: "21.4㎡", buildingRegistry: "이상없음", education: "망포초, 영통중",
    tradingCount: 22, bidInfo: "5명", owner: "최○○", appraiser: "감정평가법인",
    officialLandPrice: 280000000, tenantInfo: "전입 없음", specialNote: "유치권 없음",
    tenantDetail: "-", priceDetail: "24년 12월 4.4억 거래", tradingDetail: "최근 8건",
    recordTime: "2025-01-22 11:15", city: "경기도", district: "수원시", propType: "아파트",
  },
  {
    id: "5", memo: "역세권", link: "https://www.courtauction.go.kr", views: 156,
    auctionNo: "2024타경56789", address: "서울특별시 마포구 공덕동 공덕파크자이 105동 807호",
    totalUnits: 1341, usage: "주거용", area: "32평", builtYear: 2012,
    bidDate: "2025-03-11", appraisedValue: 980000000, minPrice: 784000000, salePrice: null,
    naverPrice: 1050000000, elevator: "비상/승용", parking: "자주식 900대",
    landShare: "29.8㎡", buildingRegistry: "이상없음", education: "공덕초, 성산중",
    tradingCount: 11, bidInfo: "2회 유찰", owner: "정○○", appraiser: "한국감정원",
    officialLandPrice: 620000000, tenantInfo: "전세 보증금 6.5억", specialNote: "세입자 대항력 있음",
    tenantDetail: "전세 보증금 6.5억 / 확정일자 확인 필요", priceDetail: "24년 10월 10.5억 거래", tradingDetail: "최근 4건",
    recordTime: "2025-01-25 16:40", city: "서울특별시", district: "마포구", propType: "아파트",
  },
  {
    id: "6", memo: "", link: "https://www.courtauction.go.kr", views: 44,
    auctionNo: "2024타경67890", address: "서울특별시 강북구 미아동 SK북한산시티 302동 1205호",
    totalUnits: 3127, usage: "주거용", area: "24평", builtYear: 2005,
    bidDate: "2025-02-27", appraisedValue: 310000000, minPrice: 217000000, salePrice: null,
    naverPrice: 340000000, elevator: "비상/승용", parking: "기계식 1500대",
    landShare: "18.9㎡", buildingRegistry: "근저당 2건", education: "미아초, 영훈중",
    tradingCount: 9, bidInfo: "3회 유찰", owner: "한○○", appraiser: "감정평가법인",
    officialLandPrice: 190000000, tenantInfo: "전입 없음", specialNote: "근저당 권리분석 필요",
    tenantDetail: "-", priceDetail: "24년 8월 3.3억 거래", tradingDetail: "최근 3건",
    recordTime: "2025-01-28 09:55", city: "서울특별시", district: "강북구", propType: "아파트",
  },
  {
    id: "7", memo: "시세 대비 저렴", link: "https://www.courtauction.go.kr", views: 201,
    auctionNo: "2024타경78901", address: "서울특별시 송파구 잠실동 잠실주공 5단지 1203호",
    totalUnits: 3930, usage: "주거용", area: "36평", builtYear: 1978,
    bidDate: "2025-03-18", appraisedValue: 2300000000, minPrice: 1840000000, salePrice: null,
    naverPrice: 2650000000, elevator: "승용", parking: "자주식 600대",
    landShare: "68.4㎡", buildingRegistry: "이상없음", education: "잠실초, 잠신중",
    tradingCount: 5, bidInfo: "1명", owner: "오○○", appraiser: "한국감정원",
    officialLandPrice: 1550000000, tenantInfo: "전입 없음", specialNote: "재건축 추진 중",
    tenantDetail: "-", priceDetail: "24년 11월 26.5억 거래", tradingDetail: "최근 2건",
    recordTime: "2025-02-01 13:20", city: "서울특별시", district: "송파구", propType: "아파트",
  },
  {
    id: "8", memo: "", link: "https://www.courtauction.go.kr", views: 73,
    auctionNo: "2024타경89012", address: "경기도 성남시 분당구 정자동 파크뷰 빌라 B동 301호",
    totalUnits: 48, usage: "주거용", area: "28평", builtYear: 2003,
    bidDate: "2025-02-13", appraisedValue: 490000000, minPrice: 343000000, salePrice: null,
    naverPrice: 520000000, elevator: "승용", parking: "자주식 60대",
    landShare: "45.2㎡", buildingRegistry: "이상없음", education: "정자초, 서현중",
    tradingCount: 2, bidInfo: "2회 유찰", owner: "윤○○", appraiser: "감정평가법인",
    officialLandPrice: 310000000, tenantInfo: "보증 1억/월 80만", specialNote: "임차인 점유",
    tenantDetail: "월세 계약 잔여 8개월", priceDetail: "23년 6월 5.1억 거래", tradingDetail: "최근 1건",
    recordTime: "2025-02-03 10:10", city: "경기도", district: "성남시", propType: "빌라",
  },
];