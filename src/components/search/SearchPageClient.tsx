"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, RotateCcw, ChevronDown, LogOut } from "lucide-react";
import { CITIES, getDistricts, getWards, matchDistrict, normalizeCity } from "@/data/korea-regions";
import { getPriceFilterLabel } from "@/data/price-filter-options";
import { getFailureRateFilterLabelFromCities, getFailureRateFilterOptionsFromCities } from "@/data/failure-rate-filter-options";
import { getAuctionCaseYears } from "@/data/auction-case-years";
import { PROPERTY_TYPE_OPTIONS, matchesPropertyType } from "@/data/property-type-options";
import { formatAuctionNoFilterLabel, matchesAuctionNoFilter } from "@/lib/auction-no-filter";
import { matchesFailureRateFilter } from "@/lib/failure-rate";
import {
  matchesProgressStatus,
  PROGRESS_STATUS_LABELS,
  progressLabelToStatus,
} from "@/lib/progress-status-filter";
import { clearAuthCookie } from "@/lib/auth";
import { fetchAuctions, fetchFavoriteIds, addFavorite, removeFavorite, logoutUser, fetchLoanPolicies, fetchRegulatedRegions, fetchIncomeLoanMultiplier, logUserAction, logUserActionsBatch, fetchResaleSoldStats, type LoanPolicy, type ResaleSoldStats } from "@/lib/api";
import { useProfileStore } from "@/store/useProfileStore";
import {
  matchesInvestmentRecommend,
  isRegulatedArea,
  DEFAULT_LOAN_POLICIES,
  type InvestmentCriteria,
} from "@/lib/investment-criteria";
import { InvestmentRecommendPanel } from "@/components/InvestmentRecommendPanel";
import type { AuctionItem, UserProfile } from "@/types/auction";
import { AuctionDetailModal } from "@/components/AuctionDetailModal";
import { AuctionChangeHistoryModal } from "@/components/AuctionChangeHistoryModal";
import { AppHeader, HEADER_BTN, HEADER_NAV_TRAILING, HEADER_TAB_ACTIVE } from "@/components/AppHeader";
import { AccountNavLink } from "@/components/AccountNavLink";
import {
  LIST_TEXT,
  LABEL_TEXT,
  SECTION_TEXT,
  FILTER_ROW,
  FILTER_LABEL,
  FILTER_SELECT_CITY,
  FILTER_SELECT_DISTRICT,
  FILTER_SELECT_WARD,
  FILTER_SELECT_PROP,
  FILTER_SELECT_FAILURE,
  FILTER_SELECT_YEAR,
  FILTER_SELECT_PROGRESS,
} from "@/lib/search-format";
import {
  SelectEl,
  FilterTextInput,
  MultiCheckboxSelect,
  FailureRateSelectEl,
  ProgressStatusSelect,
  PriceRangeSelect,
} from "./FilterControls";
import { AuctionTable } from "./AuctionTable";
import { AuctionMobileCard } from "./AuctionMobileCard";
import { PaginationBar } from "./PaginationBar";

const AUCTION_CASE_YEARS = getAuctionCaseYears();

export function SearchPageClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const auctionsQuery = useQuery({ queryKey: ["auctions-all"], queryFn: fetchAuctions });
  const items = auctionsQuery.data ?? [];
  const loading = auctionsQuery.isPending;
  const loadError = auctionsQuery.isError
    ? auctionsQuery.error instanceof Error
      ? auctionsQuery.error.message || "물건 데이터를 불러오지 못했습니다."
      : "물건 데이터를 불러오지 못했습니다."
    : "";
  const [isAdmin, setIsAdmin] = useState(false);
  const [isConsultant, setIsConsultant] = useState(false);
  const [resaleStats, setResaleStats] = useState<ResaleSoldStats | null>(null);
  const [resaleStatsLoading, setResaleStatsLoading] = useState(false);
  const [resaleStatsError, setResaleStatsError] = useState("");
  const [cities, setCities] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [ward, setWard] = useState("");
  const [availableWards, setAvailableWards] = useState<string[]>([]);
  const [wardsLoading, setWardsLoading] = useState(false);
  const [propType, setPropType] = useState("");
  const [appraisedMinInput, setAppraisedMinInput] = useState("");
  const [appraisedMaxInput, setAppraisedMaxInput] = useState("");
  const [minPriceMinInput, setMinPriceMinInput] = useState("");
  const [minPriceMaxInput, setMinPriceMaxInput] = useState("");
  const [failureRateInput, setFailureRateInput] = useState("");
  const [auctionYear, setAuctionYear] = useState("");
  const [auctionCaseNo, setAuctionCaseNo] = useState("");
  const [progressStatus, setProgressStatus] = useState<string>(PROGRESS_STATUS_LABELS.active);
  const [filterOpen, setFilterOpen] = useState(true);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const favoriteIdsQuery = useQuery({ queryKey: ["favorite-ids"], queryFn: fetchFavoriteIds });
  const favoriteIds = useMemo(() => new Set(favoriteIdsQuery.data ?? []), [favoriteIdsQuery.data]);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [selectedItem, setSelectedItem] = useState<AuctionItem | null>(null);
  const detailOpenedAtRef = useRef<number | null>(null);
  const impressionLoggedIdsRef = useRef<Set<string>>(new Set());
  const [historyItem, setHistoryItem] = useState<AuctionItem | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const storeFetchProfile = useProfileStore((s) => s.fetchProfile);
  const storeClearProfile = useProfileStore((s) => s.clearProfile);
  const [recommendEnabled, setRecommendEnabled] = useState(false);
  const [appliedCriteria, setAppliedCriteria] = useState<InvestmentCriteria | null>(null);
  const [appliedInvestableWon, setAppliedInvestableWon] = useState<number | null>(null);
  const loanPoliciesQuery = useQuery({ queryKey: ["loan-policies"], queryFn: fetchLoanPolicies });
  const loanPolicies = loanPoliciesQuery.data ?? DEFAULT_LOAN_POLICIES;
  const regulatedRegionsQuery = useQuery({ queryKey: ["regulated-regions"], queryFn: fetchRegulatedRegions });
  const regulatedRegionNames = useMemo(
    () => (regulatedRegionsQuery.data ?? []).map((r) => r.name),
    [regulatedRegionsQuery.data],
  );
  const incomeLoanMultiplierQuery = useQuery({
    queryKey: ["income-loan-multiplier"],
    queryFn: fetchIncomeLoanMultiplier,
  });
  const incomeLoanMultiplier = incomeLoanMultiplierQuery.data;
  const [pageSize, setPageSize] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);

  const availableDistricts = useMemo(() => {
    if (cities.length === 0) return [];
    const merged = new Set<string>();
    for (const city of cities) {
      getDistricts(city).forEach((district) => merged.add(district));
    }
    return Array.from(merged).sort((a, b) => a.localeCompare(b, "ko"));
  }, [cities]);

  const failureRateOptions = useMemo(
    () => getFailureRateFilterOptionsFromCities(cities),
    [cities],
  );

  useEffect(() => {
    if (!failureRateInput) return;
    if (!failureRateOptions.some((option) => option.value === failureRateInput)) {
      setFailureRateInput("");
    }
  }, [cities, failureRateOptions, failureRateInput]);

  useEffect(() => {
    setDistricts((prev) =>
      prev.filter((district) =>
        cities.some((city) =>
          getDistricts(city).some((candidate) => matchDistrict(candidate, district)),
        ),
      ),
    );
  }, [cities]);

  useEffect(() => {
    let cancelled = false;
    setProfileLoading(true);
    storeFetchProfile()
      .then((data) => {
        if (cancelled) return;
        setProfile(data);
        setIsAdmin(data.role === "admin");
        setIsConsultant(data.role === "consultant");
        if (data.role !== "admin") {
          router.replace("/");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setProfile(null);
        setIsAdmin(false);
        setIsConsultant(false);
        router.replace("/");
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => { cancelled = true; };
  }, [router, storeFetchProfile]);

  const reloadProfile = useCallback(async () => {
    const data = await storeFetchProfile({ force: true });
    setProfile(data);
    setIsAdmin(data.role === "admin");
    setIsConsultant(data.role === "consultant");
    return data;
  }, []);

  const handleApplyRecommend = useCallback(
    (criteria: InvestmentCriteria, investableWon: number, _mode: "session" | "save") => {
      setAppliedCriteria(criteria);
      setAppliedInvestableWon(investableWon);
    },
    [],
  );

  const toggleFavoriteMutation = useMutation({
    mutationFn: async (vars: { auctionId: string; next: boolean; category?: string | null; memo?: string | null }) => {
      if (vars.next) {
        await addFavorite(vars.auctionId, vars.category, vars.memo);
        logUserAction({
          itemId: vars.auctionId,
          actionType: "favorite",
          metadata: { recommended: recommendEnabled },
        });
      } else {
        await removeFavorite(vars.auctionId);
      }
    },
    onMutate: async ({ auctionId, next }) => {
      setFavoriteBusy(true);
      await queryClient.cancelQueries({ queryKey: ["favorite-ids"] });
      const previous = queryClient.getQueryData<string[]>(["favorite-ids"]);
      queryClient.setQueryData<string[]>(["favorite-ids"], (prev = []) => {
        const set = new Set(prev);
        if (next) set.add(auctionId);
        else set.delete(auctionId);
        return Array.from(set);
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context) queryClient.setQueryData(["favorite-ids"], context.previous);
    },
    onSettled: () => setFavoriteBusy(false),
  });

  async function handleToggleFavorite(auctionId: string, next: boolean, category?: string | null, memo?: string | null) {
    try {
      await toggleFavoriteMutation.mutateAsync({ auctionId, next, category, memo });
    } catch (err) {
      throw err instanceof Error ? err : new Error("관심물건 처리에 실패했습니다.");
    }
  }

  useEffect(() => {
    if (cities.length !== 1 || districts.length !== 1) {
      setAvailableWards([]);
      setWard("");
      setWardsLoading(false);
      return;
    }

    let cancelled = false;
    setWardsLoading(true);
    setAvailableWards([]);

    getWards(cities[0], districts[0])
      .then((wards) => {
        if (!cancelled) setAvailableWards(wards);
      })
      .finally(() => {
        if (!cancelled) setWardsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cities, districts]);

  useEffect(() => {
    if (districts.length !== 1) {
      setWard("");
    }
  }, [districts]);

  const handleReset = () => {
    setCities([]);
    setDistricts([]);
    setWard("");
    setPropType("");
    setAppraisedMinInput(""); setAppraisedMaxInput("");
    setMinPriceMinInput(""); setMinPriceMaxInput("");
    setFailureRateInput("");
    setAuctionYear(""); setAuctionCaseNo("");
    setProgressStatus(PROGRESS_STATUS_LABELS.active);
    setFavoritesOnly(false);
    setRecommendEnabled(false);
    setAppliedCriteria(null);
    setAppliedInvestableWon(null);
  };

  // Apply filters

  const filtered = items.filter((item) => {
    if (favoritesOnly && !favoriteIds.has(item.id)) return false;
    if (
      cities.length > 0 &&
      !cities.some((city) => normalizeCity(item.city) === normalizeCity(city))
    ) {
      return false;
    }
    if (
      districts.length > 0 &&
      !districts.some((district) => matchDistrict(item.district, district))
    ) {
      return false;
    }
    if (ward && !item.address.includes(ward)) return false;
    if (propType && !matchesPropertyType(item, propType)) return false;
    if (appraisedMinInput && item.appraisedValue < Number(appraisedMinInput)) return false;
    if (appraisedMaxInput && item.appraisedValue > Number(appraisedMaxInput)) return false;
    if (minPriceMinInput && item.minPrice < Number(minPriceMinInput)) return false;
    if (minPriceMaxInput && item.minPrice > Number(minPriceMaxInput)) return false;
    if (!matchesFailureRateFilter(item.minPrice, item.appraisedValue, failureRateInput)) return false;
    if (!matchesAuctionNoFilter(item.auctionNo, auctionYear, auctionCaseNo)) return false;
    if (!matchesProgressStatus(item.bidDate, progressLabelToStatus(progressStatus), item.caseState)) return false;
    return true;
  });

  const recommendMatches = useMemo(() => {
    if (!recommendEnabled || appliedInvestableWon == null || !appliedCriteria) return filtered;
    return filtered.filter((item) =>
      matchesInvestmentRecommend(
        item,
        appliedInvestableWon,
        appliedCriteria,
        loanPolicies,
        regulatedRegionNames,
        incomeLoanMultiplier,
      ),
    );
  }, [
    filtered,
    recommendEnabled,
    appliedInvestableWon,
    appliedCriteria,
    loanPolicies,
    regulatedRegionNames,
    incomeLoanMultiplier,
  ]);

  const displayItems = recommendEnabled ? recommendMatches : filtered;

  async function handleRunResaleStats() {
    setResaleStatsLoading(true);
    setResaleStatsError("");
    setResaleStats(null);
    try {
      const result = await fetchResaleSoldStats(filtered.map((item) => item.id));
      setResaleStats(result);
    } catch (err) {
      setResaleStatsError(err instanceof Error ? err.message : "매도분석 조회에 실패했습니다.");
    } finally {
      setResaleStatsLoading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(displayItems.length / pageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [
    displayItems.length,
    pageSize,
    cities,
    districts,
    ward,
    propType,
    appraisedMinInput,
    appraisedMaxInput,
    minPriceMinInput,
    minPriceMaxInput,
    failureRateInput,
    auctionYear,
    auctionCaseNo,
    progressStatus,
    favoritesOnly,
    recommendEnabled,
    appliedCriteria,
  ]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const pagedItems = useMemo(
    () => displayItems.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [displayItems, currentPage, pageSize],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      const unseen = pagedItems.filter(
        (item) => !impressionLoggedIdsRef.current.has(item.id),
      );
      if (unseen.length === 0) return;
      unseen.forEach((item) => impressionLoggedIdsRef.current.add(item.id));
      logUserActionsBatch(
        unseen.map((item) => ({
          itemId: item.id,
          actionType: "impression",
          metadata: { recommended: recommendEnabled },
        })),
      );
    }, 800);
    return () => clearTimeout(timer);
  }, [pagedItems, recommendEnabled]);

  function handleRowSelect(row: AuctionItem) {
    detailOpenedAtRef.current = Date.now();
    logUserAction({
      itemId: row.id,
      actionType: "click",
      metadata: { recommended: recommendEnabled },
    });
    setSelectedItem(row);
  }

  const auctionNoFilterLabel = formatAuctionNoFilterLabel(auctionYear, auctionCaseNo);

  const activeFilters = [
    auctionNoFilterLabel && `경매번호 ${auctionNoFilterLabel}`,
    cities.length > 0 &&
      (cities.length === 1 ? cities[0] : `시/도 ${cities.length}개`),
    districts.length > 0 &&
      (districts.length === 1 ? districts[0] : `군/구 ${districts.length}개`),
    ward,
    propType,
    appraisedMinInput && `감정가 ${getPriceFilterLabel(appraisedMinInput)} 이상`,
    appraisedMaxInput && `감정가 ${getPriceFilterLabel(appraisedMaxInput)} 이하`,
    minPriceMinInput && `최저가 ${getPriceFilterLabel(minPriceMinInput)} 이상`,
    minPriceMaxInput && `최저가 ${getPriceFilterLabel(minPriceMaxInput)} 이하`,
    failureRateInput &&
      `유찰률 ${getFailureRateFilterLabelFromCities(failureRateInput, cities)}`,
    progressStatus !== PROGRESS_STATUS_LABELS.all && `진행상태 ${progressStatus}`,
    favoritesOnly && "관심물건",
    recommendEnabled && appliedCriteria && "투자 추천",
  ].filter(Boolean);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {
      // ignore
    }
    clearAuthCookie();
    storeClearProfile();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <AppHeader
        maxWidth="1400"
        nav={
          <>
            <Link href="/" className={HEADER_BTN}>
              추천 물건
            </Link>
            <span className={HEADER_TAB_ACTIVE}>전체 검색</span>
            {isConsultant && (
              <Link href="/consultant" className={HEADER_BTN}>
                컨설턴트
              </Link>
            )}
            <Link href="/favorites" className={HEADER_BTN}>
              내 물건
            </Link>
            <div className={HEADER_NAV_TRAILING}>
              <Link
                href="/courses/my"
                className={`${HEADER_BTN} border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10`}
              >
                강의실
              </Link>
              {isAdmin && (
                <Link href="/admin" className={HEADER_BTN}>
                  관리자
                </Link>
              )}
              <AccountNavLink name={profile?.name} />
              <button type="button" onClick={handleLogout} className={HEADER_BTN}>
                <LogOut size={16} />
                로그아웃
              </button>
            </div>
          </>
        }
      />

      <main className="max-w-[1600px] mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5">
        {/* Filter Panel */}
        <div className="bg-card border border-border rounded-sm shadow-sm">
          {/* Filter toggle header */}
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-secondary/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Search size={16} className="text-primary" />
              <span className={`${SECTION_TEXT} font-semibold text-foreground`}>검색 필터</span>
              {activeFilters.length > 0 && (
                <span className={`bg-primary text-primary-foreground ${LIST_TEXT} font-mono px-1.5 py-0.5 rounded-sm`}>
                  {activeFilters.length}
                </span>
              )}
            </div>
            <ChevronDown size={16} className={`text-muted-foreground transition-transform duration-200 ${filterOpen ? "rotate-180" : ""}`} />
          </button>

          {filterOpen && (
            <div className="border-t border-border">
              <div className="px-5 py-4 border-b border-border space-y-4">
                <div className={`${FILTER_ROW} items-center`}>
                  <span className={FILTER_LABEL}>경매번호</span>
                  <div className="flex items-center gap-2 w-fit">
                    <div className={`${FILTER_SELECT_YEAR} shrink-0`}>
                      <SelectEl
                        value={auctionYear}
                        onChange={setAuctionYear}
                        options={AUCTION_CASE_YEARS}
                        placeholder="사건년도"
                      />
                    </div>
                    <span className={`${LIST_TEXT} text-muted-foreground shrink-0 select-none`}>타경</span>
                    <div className={`${FILTER_SELECT_YEAR} shrink-0`}>
                      <FilterTextInput value={auctionCaseNo} onChange={setAuctionCaseNo} />
                    </div>
                  </div>
                </div>

                <div className={`${FILTER_ROW} items-start sm:items-center`}>
                  <span className={FILTER_LABEL}>주소</span>
                  <div className="flex flex-wrap items-center gap-2 sm:w-fit">
                    <div className={`${FILTER_SELECT_CITY} sm:shrink-0`}>
                      <MultiCheckboxSelect
                        options={[...CITIES]}
                        selected={cities}
                        onChange={setCities}
                        placeholder="시/도 선택"
                      />
                    </div>
                    <div className={`${FILTER_SELECT_DISTRICT} sm:shrink-0`}>
                      <MultiCheckboxSelect
                        options={availableDistricts}
                        selected={districts}
                        onChange={setDistricts}
                        placeholder={cities.length > 0 ? "군/구 선택" : "시/도 먼저"}
                        disabled={cities.length === 0}
                      />
                    </div>
                    <div className={`${FILTER_SELECT_WARD} sm:shrink-0`}>
                      <SelectEl
                        value={ward}
                        onChange={setWard}
                        options={availableWards}
                        placeholder={
                          cities.length !== 1 || districts.length !== 1
                            ? "군/구 1개 선택"
                            : wardsLoading
                              ? "불러오는 중..."
                              : availableWards.length
                                ? "동/읍/면 선택"
                                : "해당 없음"
                        }
                        disabled={
                          cities.length !== 1 ||
                          districts.length !== 1 ||
                          wardsLoading ||
                          !availableWards.length
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className={`${FILTER_ROW} items-center`}>
                  <span className={FILTER_LABEL}>물건종류</span>
                  <div className={`${FILTER_SELECT_PROP} shrink-0`}>
                    <SelectEl
                      value={propType}
                      onChange={setPropType}
                      options={[...PROPERTY_TYPE_OPTIONS]}
                      placeholder="선택"
                    />
                  </div>
                </div>

                <div className={`${FILTER_ROW} items-center`}>
                  <span className={FILTER_LABEL}>감정가</span>
                  <PriceRangeSelect
                    minValue={appraisedMinInput}
                    maxValue={appraisedMaxInput}
                    onMinChange={setAppraisedMinInput}
                    onMaxChange={setAppraisedMaxInput}
                  />
                </div>

                <div className={`${FILTER_ROW} items-center`}>
                  <span className={FILTER_LABEL}>최저가</span>
                  <PriceRangeSelect
                    minValue={minPriceMinInput}
                    maxValue={minPriceMaxInput}
                    onMinChange={setMinPriceMinInput}
                    onMaxChange={setMinPriceMaxInput}
                  />
                </div>

                <div className={`${FILTER_ROW} items-center`}>
                  <span className={FILTER_LABEL}>유찰률</span>
                  <div className={`${FILTER_SELECT_FAILURE} shrink-0`}>
                    <FailureRateSelectEl
                      value={failureRateInput}
                      onChange={setFailureRateInput}
                      options={failureRateOptions}
                    />
                  </div>
                </div>

                <div className={`${FILTER_ROW} items-center`}>
                  <span className={FILTER_LABEL}>진행상태</span>
                  <div className={`${FILTER_SELECT_PROGRESS} shrink-0`}>
                    <ProgressStatusSelect value={progressStatus} onChange={setProgressStatus} />
                  </div>
                </div>

                <div className={`${FILTER_ROW} items-center`}>
                  <span className={FILTER_LABEL}>관심물건</span>
                  <label className={`flex items-center gap-2 ${LIST_TEXT} cursor-pointer select-none`}>
                    <input
                      type="checkbox"
                      checked={favoritesOnly}
                      onChange={(e) => setFavoritesOnly(e.target.checked)}
                      className="accent-primary"
                    />
                    관심물건만 보기
                    <span className={`${LABEL_TEXT} text-muted-foreground`}>
                      ({favoriteIds.size}건)
                    </span>
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="px-5 py-3 bg-secondary/30 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {activeFilters.map((f, i) => (
                    <span key={i} className={`inline-flex items-center px-2 py-0.5 bg-primary/10 text-primary ${LIST_TEXT} font-medium rounded-sm border border-primary/20`}>
                      {f as string}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2 shrink-0 sm:ml-4">
                  <button onClick={handleReset} className={`flex items-center gap-1.5 px-3 py-2 ${LIST_TEXT} font-medium text-muted-foreground border border-border rounded-sm hover:text-foreground hover:border-foreground/30 transition-colors`}>
                    <RotateCcw size={15} />초기화
                  </button>
                  <button className={`flex items-center gap-1.5 px-5 py-2 bg-primary text-primary-foreground ${LIST_TEXT} font-semibold rounded-sm hover:bg-accent transition-colors shadow-sm`}>
                    <Search size={15} />검색
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <InvestmentRecommendPanel
          profile={profile}
          profileLoading={profileLoading}
          loanPolicies={loanPolicies}
          recommendEnabled={recommendEnabled}
          onRecommendEnabledChange={setRecommendEnabled}
          appliedCriteria={appliedCriteria}
          appliedInvestableWon={appliedInvestableWon}
          matchCount={recommendMatches.length}
          filteredCount={filtered.length}
          onApply={handleApplyRecommend}
          onReloadProfile={reloadProfile}
        />

        {/* Result Summary */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`${SECTION_TEXT} font-semibold text-foreground`}>검색 결과</span>
          <span className={`font-mono ${LIST_TEXT} text-primary font-bold`}>{displayItems.length}</span>
          <span className={`${LIST_TEXT} text-muted-foreground`}>건</span>
          <span className={`${LABEL_TEXT} text-muted-foreground ml-1`}>/ 전체 {items.length}건</span>
          {isAdmin && (
            <button
              type="button"
              onClick={() => void handleRunResaleStats()}
              disabled={resaleStatsLoading || filtered.length === 0}
              className={`ml-auto px-3 py-1.5 ${LIST_TEXT} font-semibold rounded-sm border border-primary/30 text-primary hover:bg-primary/10 disabled:opacity-50`}
            >
              {resaleStatsLoading ? "매도분석 조회 중..." : `이 필터로 매도분석 (${filtered.length}건)`}
            </button>
          )}
        </div>

        {isAdmin && (resaleStats || resaleStatsError) && (
          <div className="rounded-sm border border-border bg-card p-4 space-y-3">
            {resaleStatsError ? (
              <p className={`${LIST_TEXT} text-destructive`}>{resaleStatsError}</p>
            ) : resaleStats ? (
              <>
                <div className="flex items-center justify-between">
                  <p className={`${LIST_TEXT} font-semibold text-foreground`}>
                    이 필터 낙찰물건의 매도분석 결과
                  </p>
                  <button
                    type="button"
                    onClick={() => setResaleStats(null)}
                    className={`${LABEL_TEXT} text-muted-foreground hover:text-foreground`}
                  >
                    닫기
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 border border-border rounded-sm">
                    <p className={`${LABEL_TEXT} text-muted-foreground`}>필터 중 낙찰 물건</p>
                    <p className="text-xl font-bold text-foreground mt-0.5">{resaleStats.total}건</p>
                  </div>
                  <div className="p-3 border border-border rounded-sm">
                    <p className={`${LABEL_TEXT} text-muted-foreground`}>QA 후보 있음(55점+)</p>
                    <p className="text-xl font-bold text-foreground mt-0.5">
                      {resaleStats.withCandidate}건
                      <span className={`${LABEL_TEXT} font-normal text-muted-foreground ml-1`}>
                        ({resaleStats.total > 0 ? Math.round((resaleStats.withCandidate / resaleStats.total) * 100) : 0}%)
                      </span>
                    </p>
                  </div>
                  <div className="p-3 border border-border rounded-sm">
                    <p className={`${LABEL_TEXT} text-muted-foreground`}>매도 확정 표시(70점+)</p>
                    <p className="text-xl font-bold text-emerald-700 mt-0.5">
                      {resaleStats.displayed}건
                      <span className={`${LABEL_TEXT} font-normal text-muted-foreground ml-1`}>
                        ({resaleStats.total > 0 ? Math.round((resaleStats.displayed / resaleStats.total) * 100) : 0}%)
                      </span>
                    </p>
                  </div>
                </div>
                {resaleStats.items.length > 0 && (
                  <div className="max-h-72 overflow-y-auto border border-border rounded-sm">
                    <table className="w-full text-xs border-collapse">
                      <thead className="sticky top-0 bg-secondary/50">
                        <tr className="text-left">
                          <th className="px-3 py-2 font-semibold whitespace-nowrap">사건번호</th>
                          <th className="px-3 py-2 font-semibold">주소</th>
                          <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">낙찰가</th>
                          <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">점수</th>
                          <th className="px-3 py-2 font-semibold whitespace-nowrap">등급</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resaleStats.items.map((row) => (
                          <tr key={row.id} className="border-t border-border">
                            <td className="px-3 py-2 whitespace-nowrap">{row.auctionNo}</td>
                            <td className="px-3 py-2">{row.address}</td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              {row.salePrice != null ? row.salePrice.toLocaleString("ko-KR") : "-"}
                            </td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">{row.candidateScore ?? "-"}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {row.candidateTier ?? <span className="text-muted-foreground">후보 없음</span>}
                              {row.displayed && (
                                <span className="ml-1 text-emerald-700 font-semibold">(노출됨)</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}

        {loadError && (
          <div className={`rounded-sm border border-destructive/30 bg-destructive/5 px-4 py-3 ${LIST_TEXT} text-destructive`}>
            {loadError}
            <span className={`text-muted-foreground ml-2 ${LABEL_TEXT}`}>auction-api에서 npm run start:dev 가 실행 중인지 확인해 주세요.</span>
          </div>
        )}

        {loading ? (
          <div className={`rounded-sm border border-border bg-card px-6 py-16 text-center ${LIST_TEXT} text-muted-foreground`}>
            물건 데이터를 불러오는 중...
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <AuctionTable
                data={pagedItems}
                isAdmin={isAdmin}
                onRowClick={handleRowSelect}
                recommendCriteria={recommendEnabled ? appliedCriteria : null}
                loanPolicies={loanPolicies}
                regulatedRegionNames={regulatedRegionNames}
                incomeLoanMultiplier={incomeLoanMultiplier}
              />
            </div>
            <div className="md:hidden space-y-2.5">
              {pagedItems.length === 0 ? (
                <div className={`rounded-sm border border-border bg-card px-6 py-16 text-center ${LIST_TEXT} text-muted-foreground`}>
                  조건에 맞는 물건이 없습니다.
                </div>
              ) : (
                pagedItems.map((item) => (
                  <AuctionMobileCard
                    key={item.id}
                    item={item}
                    onClick={() => handleRowSelect(item)}
                    recommendCriteria={recommendEnabled ? appliedCriteria : null}
                    loanPolicies={loanPolicies}
                    regulatedRegionNames={regulatedRegionNames}
                    incomeLoanMultiplier={incomeLoanMultiplier}
                  />
                ))
              )}
            </div>
            <PaginationBar
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </main>

      <AuctionDetailModal
        item={selectedItem}
        onClose={() => {
          if (selectedItem && detailOpenedAtRef.current != null) {
            const durationSeconds = Math.round(
              (Date.now() - detailOpenedAtRef.current) / 1000,
            );
            logUserAction({
              itemId: selectedItem.id,
              actionType: "detail_view",
              durationSeconds,
              metadata: { recommended: recommendEnabled },
            });
          }
          detailOpenedAtRef.current = null;
          setSelectedItem(null);
        }}
        editable={isAdmin}
        isAdmin={isAdmin}
        viewerRole={profile?.role ?? null}
        housingCount={profile?.housingCount}
        annualNetIncome={profile?.annualNetIncome ?? null}
        regulatedArea={
          selectedItem
            ? isRegulatedArea(selectedItem.city, selectedItem.district, regulatedRegionNames)
            : null
        }
        aiAnalysisLimit={profile?.aiAnalysisLimit}
        aiAnalysisUsed={profile?.aiAnalysisUsed}
        onAiAnalysisUsed={() => {
          setProfile((prev) =>
            prev ? { ...prev, aiAnalysisUsed: (prev.aiAnalysisUsed ?? 0) + 1 } : prev,
          );
          useProfileStore.getState().patchProfile({
            aiAnalysisUsed: (profile?.aiAnalysisUsed ?? 0) + 1,
          });
        }}
        isFavorite={selectedItem ? favoriteIds.has(selectedItem.id) : false}
        favoriteBusy={favoriteBusy}
        onToggleFavorite={
          selectedItem
            ? (next, category, memo) => handleToggleFavorite(selectedItem.id, next, category, memo)
            : undefined
        }
        onAiAnalysisClick={(row) =>
          logUserAction({
            itemId: row.id,
            actionType: "ai_analysis_click",
            metadata: { recommended: recommendEnabled },
          })
        }
        onDislike={
          isAdmin
            ? undefined
            : (row) =>
                logUserAction({
                  itemId: row.id,
                  actionType: "dislike",
                  metadata: { recommended: recommendEnabled },
                })
        }
        onReviewed={
          isAdmin
            ? undefined
            : (row) =>
                logUserAction({
                  itemId: row.id,
                  actionType: "reviewed",
                  metadata: { recommended: recommendEnabled },
                })
        }
        onSaved={(saved) => {
          queryClient.setQueryData<AuctionItem[]>(["auctions-all"], (prev = []) =>
            prev.map((row) => (row.id === saved.id ? saved : row)),
          );
          setSelectedItem(saved);
        }}
        onDeleted={(id) => {
          queryClient.setQueryData<AuctionItem[]>(["auctions-all"], (prev = []) =>
            prev.filter((row) => row.id !== id),
          );
          setSelectedItem(null);
          if (historyItem?.id === id) setHistoryItem(null);
        }}
        onViewHistory={isAdmin ? setHistoryItem : undefined}
      />
      <AuctionChangeHistoryModal
        item={historyItem}
        open={Boolean(historyItem)}
        onClose={() => setHistoryItem(null)}
      />
    </div>
  );
}
