"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createRedevelopmentZone,
  deleteRedevelopmentZone,
  fetchRedevelopmentMapData,
  fetchResearchMapPoints,
  fetchZoneRuns,
  fetchZoneConsentSummaries,
  refreshZoneBlog,
  startZoneResearch,
  setRedevelopmentZoneInterest,
  updateRedevelopmentZone,
  type RedevelopmentMapAuction,
  type RedevelopmentPoint,
  type RedevelopmentZone,
} from "@/lib/api";
import { loadKakaoMaps } from "@/lib/kakao-maps";
import { RedevelopmentEditMapView } from "./RedevelopmentEditMapView";
import { RedevelopmentImageTraceTool } from "./RedevelopmentImageTraceTool";
import { RedevelopmentTraceFailurePanel } from "./RedevelopmentTraceFailurePanel";
import { RedevelopmentEditSelectedAuction } from "./RedevelopmentEditSelectedAuction";

import { RedevelopmentEditAuctionList } from "./RedevelopmentEditAuctionList";
import { zoneBusinessTypeLabel, zoneLegalDong, zonePassesFilters, zoneStyle } from "@/lib/zone-stage-style";
import { PROGRESS_STEPS, stageDisplayLabel, stagePosition } from "@/lib/zone-progress";
import { countCurrentZoneAuctions } from "@/lib/zone-auction-counts";
import { RedevelopmentEditSelectedZone } from "./RedevelopmentEditSelectedZone";
import { readFastResearch } from "./RedevelopmentEditResearchPanel";
import { RedevelopmentEditZoneFilters } from "./RedevelopmentEditZoneFilters";
import { buildZoneBoxes, DEFAULT_BOUNDARY_TOLERANCE_M, findZoneIds, NEAR_BOUNDARY_MAX_M } from "@/lib/zone-geometry";

const STAGE_OPTIONS = [
  "정비구역지정",
  "추진위원회승인",
  "조합설립인가",
  "사업시행인가",
  "관리처분인가",
  "이주철거",
  "착공",
  "준공",
];

type ZoneFormState = { name: string; region: string; stage: string; memo: string };

const EMPTY_FORM: ZoneFormState = { name: "", region: "", stage: "", memo: "" };
const RECENT_AUCTION_SEARCHES_KEY = "redev-recent-auction-searches";
const MAX_RECENT_AUCTION_SEARCHES = 8;
type RecentAuctionSearch = { auctionNo: string; searchedAt: number };

export function RedevelopmentEditTab() {
  const [zones, setZones] = useState<RedevelopmentZone[]>([]);
  // 지도에는 재개발닷컴에서 가져온 구역만 그린다(직접 그린 구역·기존 수집분은 숨김 — 삭제는 아님, 2026-10-24).
  // 지도 필터(사업종류·진행단계)와 좌측 구역 목록 필터는 서로 별개로 동작한다(사용자 요청). 비어 있으면 전체.
  const [mapTypes, setMapTypes] = useState<string[]>([]);
  const [mapStages, setMapStages] = useState<string[]>([]);
  const [listTypes, setListTypes] = useState<string[]>([]);
  const [listStages, setListStages] = useState<string[]>([]);
  const [currentAuctionOnly, setCurrentAuctionOnly] = useState(false);
  const [mapCurrentAuctionOnly, setMapCurrentAuctionOnly] = useState(false);
  const allJaegebalZones = useMemo(() => zones.filter((z) => z.sourceDatasetId === "jaegebal"), [zones]);
  const [showZoneUpdateInfo, setShowZoneUpdateInfo] = useState(false);
  // 재개발닷컴 구역도의 가장 최근 반영 시각(구역별 updatedAt 중 최신) — "구역도 업데이트" 안내용.
  const jaegebalLastUpdatedAt = useMemo(
    () => allJaegebalZones.reduce((m, z) => (z.updatedAt > m ? z.updatedAt : m), ""),
    [allJaegebalZones],
  );
  // 좌표를 채울 구 = 재개발닷컴 구역이 있는 서울 전체 구.
  const allGu = useMemo(() => Array.from(new Set(allJaegebalZones.map((z) => z.region).filter((r) => /구$/.test(r)))).sort(), [allJaegebalZones]);
  const mapZones = useMemo(
    () => zones.filter((z) => z.sourceDatasetId === "jaegebal" && zonePassesFilters(z, mapTypes, mapStages)),
    [zones, mapTypes, mapStages],
  );
  const [auctions, setAuctions] = useState<RedevelopmentMapAuction[]>([]);
  // 구역 경계 안의 좌표 확인된 빌라만 집계한다. 상태가 없으면 진행 중으로 추정하지 않는다.
  const auctionCountsByZoneId = useMemo(() => countCurrentZoneAuctions(auctions), [auctions]);
  // 목록과 지도의 "현재 경매물건 있는 구역" 조건을 표시 건수와 동일하게 맞춘다.
  const currentAuctionZoneIds = useMemo(
    () => new Set([...auctionCountsByZoneId].filter(([, count]) => count.active > 0).map(([id]) => id)),
    [auctionCountsByZoneId],
  );
  // 경매 위치 판정(scopedAuctions)은 전체 지도 구역을 유지하고, 이 값은 경계 표시만 좁힌다.
  const mapDisplayZones = useMemo(
    () => (mapCurrentAuctionOnly ? mapZones.filter((zone) => currentAuctionZoneIds.has(zone.id)) : mapZones),
    [mapZones, mapCurrentAuctionOnly, currentAuctionZoneIds],
  );
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [auctionCountsLoaded, setAuctionCountsLoaded] = useState(false);
  // 구역 경계에서 이 거리(m) 이내의 물건도 "구역 안"으로 본다(주소 지오코딩 오차 보정, 사용자 요청 2026-10-24).
  const [toleranceM, setToleranceM] = useState(DEFAULT_BOUNDARY_TOLERANCE_M);
  const [message, setMessage] = useState<string | null>(null);

  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [zoneFocusNonce, setZoneFocusNonce] = useState(0);

  const [drawing, setDrawing] = useState(false);
  const [imageTracing, setImageTracing] = useState(false);
  const [imageTraceSourceUrl, setImageTraceSourceUrl] = useState<string | null>(null);
  const [imageTraceCenter, setImageTraceCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [imageTraceArea, setImageTraceArea] = useState<number | null>(null);
  const [editingZone, setEditingZone] = useState<RedevelopmentZone | null>(null);
  const [draftPointCount, setDraftPointCount] = useState(0);
  const [pendingPoints, setPendingPoints] = useState<RedevelopmentPoint[] | null>(null);
  const [form, setForm] = useState<ZoneFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);


  // 구역 목록을 구별로 정리하기 위한 구 이름 — region이 전부 "서울특별시"라
  // 좌표(폴리곤 중심)를 카카오 역지오코딩해서 구한다(사용자 요청: "구별로 정리").
  const [districtById, setDistrictById] = useState<Record<string, string>>({});
  const [dongById, setDongById] = useState<Record<string, string>>({});
  const [guFilter, setGuFilter] = useState("");
  const [dongFilter, setDongFilter] = useState("");

  useEffect(() => {
    const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;
    const pending = zones.filter((z) => !(z.id in districtById));
    if (pending.length === 0) return;
    let cancelled = false;
    const fromRegion: Record<string, string> = {};
    const needGeocode: RedevelopmentZone[] = [];
    for (const z of pending) {
      const m = z.region.match(/[가-힣]+구$/);
      if (m) fromRegion[z.id] = m[0];
      else if (z.polygon.length > 0) needGeocode.push(z);
      else fromRegion[z.id] = "";
    }
    if (Object.keys(fromRegion).length > 0) setDistrictById((prev) => ({ ...prev, ...fromRegion }));
    // 동 이름: 저장해 둔 법정동(재개발닷컴 원본 주소)을 우선 쓰고, 없는 구역만 좌표로 조회한다.
    const fromMeta: Record<string, string> = {};
    for (const z of pending) {
      const d = zoneLegalDong(z);
      if (d) fromMeta[z.id] = d;
    }
    if (Object.keys(fromMeta).length > 0) setDongById((prev) => ({ ...fromMeta, ...prev }));
    for (const z of pending) if (z.polygon.length > 0 && !fromMeta[z.id] && !needGeocode.includes(z)) needGeocode.push(z);
    if (needGeocode.length === 0 || !appKey) return;
    loadKakaoMaps(appKey).then(() => {
      if (cancelled || !window.kakao?.maps.services) return;
      const geocoder = new window.kakao.maps.services.Geocoder();
      const OK = window.kakao.maps.services.Status.OK;
      needGeocode.forEach((z) => {
        const lat = z.polygon.reduce((s, p) => s + p.lat, 0) / z.polygon.length;
        const lng = z.polygon.reduce((s, p) => s + p.lng, 0) / z.polygon.length;
        geocoder.coord2RegionCode(lng, lat, (result, status) => {
          if (cancelled) return;
          // 행정동(H) 기준 — 지도의 동 경계(행정동)와 이름이 맞는다.
          const hit = status === OK ? (result.find((r) => r.region_type === "H") ?? result[0]) : undefined;
          setDistrictById((prev) => ({ ...prev, [z.id]: prev[z.id] || (hit?.region_2depth_name ?? "") }));
          setDongById((prev) => ({ ...prev, [z.id]: prev[z.id] || (hit?.region_3depth_name ?? "").replace(/\d+(?=동$)/, "") }));
        });
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones]);

  const [interestOnly, setInterestOnly] = useState(false);
  const [completedOnly, setCompletedOnly] = useState(false);
  const interestCount = useMemo(() => zones.filter((z) => z.isInterest).length, [zones]);
  // 목록 배지와 필터는 동일한 조사 상태를 사용한다.
  const queryClient = useQueryClient();
  const { data: zoneRuns = [], isError: zoneRunsError } = useQuery({
    queryKey: ["redev-zone-runs"],
    queryFn: fetchZoneRuns,
    staleTime: 10_000,
    refetchInterval: (q) => ((q.state.data ?? []).some((r) => r.status === "running") ? 5000 : false),
  });
  const runByZoneId = useMemo(() => new Map(zoneRuns.map((r) => [r.zoneId, r])), [zoneRuns]);
  const { data: zoneConsents = [] } = useQuery({
    queryKey: ["redev-zone-consents"],
    queryFn: fetchZoneConsentSummaries,
    staleTime: 10_000,
    refetchInterval: zoneRuns.some((r) => r.status === "running") ? 5000 : false,
  });
  const consentByZoneId = useMemo(() => new Map(zoneConsents.map((c) => [c.zoneId, c])), [zoneConsents]);
  const hadRunningResearch = useRef(false);
  useEffect(() => {
    const running = zoneRuns.some((r) => r.status === "running");
    if (hadRunningResearch.current && !running) void queryClient.invalidateQueries({ queryKey: ["redev-zone-consents"] });
    hadRunningResearch.current = running;
  }, [zoneRuns, queryClient]);

  async function toggleInterest(zone: RedevelopmentZone) {
    const next = !zone.isInterest;
    const apply = (value: boolean) => setZones((prev) => prev.map((z) => (z.id === zone.id ? { ...z, isInterest: value } : z)));
    apply(next); // 바로 반영하고, 서버 저장에 실패하면 되돌린다.
    try {
      await setRedevelopmentZoneInterest(zone.id, next);
    } catch (err) {
      apply(!next);
      setMessage(err instanceof Error ? err.message : "관심 구역 표시를 바꾸지 못했습니다.");
    }
  }

  const groupedZones = useMemo(() => {
    const groups = new Map<string, RedevelopmentZone[]>();
    for (const z of zones) {
      if (currentAuctionOnly && !currentAuctionZoneIds.has(z.id)) continue;
      if (interestOnly && !z.isInterest) continue;
      const run = runByZoneId.get(z.id);
      if (completedOnly && !(run?.status === "done" || (run?.finishedAt && run.status !== "running"))) continue;
      if (guFilter && districtById[z.id] !== guFilter) continue;
      if (dongFilter && dongById[z.id] !== dongFilter) continue;
      if (!zonePassesFilters(z, listTypes, listStages)) continue;
      const d = districtById[z.id] || "구 확인 중/미상";
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d)!.push(z);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      const aUnknown = a.startsWith("구 확인");
      const bUnknown = b.startsWith("구 확인");
      if (aUnknown !== bUnknown) return aUnknown ? 1 : -1;
      return a.localeCompare(b, "ko");
    });
  }, [zones, currentAuctionZoneIds, currentAuctionOnly, districtById, dongById, guFilter, dongFilter, listTypes, listStages, interestOnly, completedOnly, runByZoneId]);

  const guOptions = useMemo(
    () => Array.from(new Set(Object.values(districtById).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ko")),
    [districtById],
  );
  const dongOptions = useMemo(
    () =>
      Array.from(
        new Set(zones.filter((z) => !guFilter || districtById[z.id] === guFilter).map((z) => dongById[z.id]).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b, "ko")),
    [zones, districtById, dongById, guFilter],
  );
  const filteredCount = groupedZones.reduce((n, [, l]) => n + l.length, 0);
  const [expandedDistrict, setExpandedDistrict] = useState<string | null | undefined>(undefined);
  // 처음에는 첫 구를 열고 나머지는 접는다. 한 번에 한 구를 열어 다른 구도 쉽게 찾는다.
  const openDistrict = expandedDistrict === undefined || (expandedDistrict !== null && !groupedZones.some(([district]) => district === expandedDistrict))
    ? groupedZones[0]?.[0] ?? null : expandedDistrict;
  const fullGroupByDistrict = useMemo(() => new Map(groupedZones), [groupedZones]);
  // 구를 열었을 때 너무 많은 항목을 한 번에 그리지 않는다. 선택은 화면 표시 제한과 무관하다.
  const LIST_LIMIT = 150;
  const listLimited = !guFilter && !dongFilter && (fullGroupByDistrict.get(openDistrict ?? "")?.length ?? 0) > LIST_LIMIT;
  const listGroups = useMemo(() => {
    return groupedZones.map(([district, list]): [string, RedevelopmentZone[]] => [district, district === openDistrict ? (listLimited ? list.slice(0, LIST_LIMIT) : list) : []]);
  }, [groupedZones, listLimited, openDistrict]);
  const groupSize = useMemo(() => new Map(groupedZones.map(([d, l]) => [d, l.length])), [groupedZones]);

  const load = useCallback(() => {
    setLoading(true);
    setMessage(null);
    fetchRedevelopmentMapData()
      .then((res) => {
        setZones(res.zones);
        setAuctions(res.auctions);
        setAuctionCountsLoaded(true);
      })
      .catch((err) => { setAuctionCountsLoaded(false); setMessage(err instanceof Error ? err.message : "불러오기 실패"); })
      .finally(() => {
        setLoading(false);
        setLoadedOnce(true);
      });
  }, []);

  useEffect(load, [load]);

  function handleZoneClick(zoneId: string) {
    setSelectedZoneId(zoneId);
    setZoneFocusNonce((value) => value + 1);
    if (!drawing) setZonePopupId(zoneId);
  }

  function startNewZone() {
    setEditingZone(null);
    setPendingPoints(null);
    setForm(EMPTY_FORM);
    setSelectedZoneId(null);
    setDrawing(true);
  }

  function startNewZoneFromImage() {
    setEditingZone(null);
    setPendingPoints(null);
    setForm(EMPTY_FORM);
    setSelectedZoneId(null);
    setImageTraceSourceUrl(null);
    setImageTraceArea(null);
    setImageTracing(true);
  }

  /** 이미 위치도 이미지 URL을 확보한 구역(예: 은평구청 자동수집)을 업로드
   * 없이 바로 그 이미지로 정밀 보정한다(사용자 요청, 2026-08-04: "은평구청
   * 데이터를 기반으로 정밀 경계를 통한 구역도 적용해보는거 어때"). */
  function startImageRefine(zone: RedevelopmentZone) {
    setEditingZone(zone);
    setPendingPoints(null);
    setForm({ name: zone.name, region: zone.region, stage: zone.stage, memo: zone.memo ?? "" });
    setSelectedZoneId(zone.id);
    setImageTraceSourceUrl(zone.referenceImageUrl);
    setImageTraceArea(zone.areaSqMeters);
    if (zone.polygon.length > 0) {
      const lat = zone.polygon.reduce((sum, p) => sum + p.lat, 0) / zone.polygon.length;
      const lng = zone.polygon.reduce((sum, p) => sum + p.lng, 0) / zone.polygon.length;
      setImageTraceCenter({ lat, lng });
    } else {
      setImageTraceCenter(null);
    }
    setImageTracing(true);
  }

  function startRedrawZone(zone: RedevelopmentZone) {
    setEditingZone(zone);
    setPendingPoints(null);
    setForm({ name: zone.name, region: zone.region, stage: zone.stage, memo: zone.memo ?? "" });
    setSelectedZoneId(zone.id);
    setDrawing(true);
  }

  function cancelDrawing() {
    setDrawing(false);
    setEditingZone(null);
    setPendingPoints(null);
  }

  function handleFinishDraw(points: RedevelopmentPoint[]) {
    setPendingPoints(points);
    setDrawing(false);
  }

  /** "이 경계로 확정" 처리.
   *
   * 기존 구역을 고치는 중이면 곧바로 저장한다 — 예전에는 경계를 임시
   * 보관만 하고 화면 위쪽 폼의 저장 버튼을 따로 눌러야 반영됐는데,
   * 도구가 화면 아래에 있어 확정만 누르고 저장을 안 한 채 끝내기 쉬웠다
   * (사용자 리포트, 2026-08-06: "확정 눌러도 실제 지도에 반영이 안되는데").
   * 새 구역을 그리는 중이면 구역명 등을 받아야 하므로 기존대로 폼으로 넘긴다. */
  async function handleFinishImageTrace(points: RedevelopmentPoint[]) {
    if (!editingZone) {
      setPendingPoints(points);
      setImageTracing(false);
      setImageTraceSourceUrl(null);
      setImageTraceCenter(null);
      setImageTraceArea(null);
      return;
    }

    setSaving(true);
    try {
      await updateRedevelopmentZone(editingZone.id, {
        polygon: points,
        boundaryType: "MANUAL",
      });
      setPendingPoints(null);
      setMessage(`"${editingZone.name}" 구역 경계를 저장했습니다.`);
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "구역 경계 저장 실패");
      setPendingPoints(points);
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    if (!pendingPoints || pendingPoints.length < 3) return;
    const name = form.name.trim();
    if (!name) {
      setMessage("구역명을 입력해주세요.");
      return;
    }
    setSaving(true);
    try {
      if (editingZone) {
        await updateRedevelopmentZone(editingZone.id, {
          name,
          region: form.region.trim(),
          stage: form.stage.trim(),
          memo: form.memo.trim(),
          polygon: pendingPoints,
          boundaryType: "MANUAL",
        });
      } else {
        await createRedevelopmentZone({
          name,
          region: form.region.trim(),
          stage: form.stage.trim(),
          memo: form.memo.trim(),
          polygon: pendingPoints,
          boundaryType: "MANUAL",
        });
      }
      setPendingPoints(null);
      setEditingZone(null);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "구역 저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveInfo(zone: RedevelopmentZone, form: { name: string; region: string; stage: string; memo: string }) {
    const name = form.name.trim();
    if (!name) throw new Error("구역명을 입력해주세요.");
    await updateRedevelopmentZone(zone.id, {
      name,
      region: form.region.trim(),
      stage: form.stage.trim(),
      memo: form.memo.trim(),
    });
    load();
  }

  async function handleDeleteZone(zone: RedevelopmentZone): Promise<boolean> {
    if (!confirm(`"${zone.name}" 구역을 삭제할까요?`)) return false;
    try {
      await deleteRedevelopmentZone(zone.id);
      if (selectedZoneId === zone.id) setSelectedZoneId(null);
      load();
      return true;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "구역 삭제 실패");
      return false;
    }
  }


  // 재개발구역 안에 들어가는 경매물건 — 구 필터를 걸면 그 구 물건만. 지도 마커와
  // 아래 매물 목록이 같은 집합을 쓴다(사용자 요청: "금천구 경매물건 중 재개발구역에
  // 해당하는 물건을 지도에 찍고 매물목록 만들기").
  const zoneNameById = useMemo(() => new Map(zones.map((z) => [z.id, z.name])), [zones]);
  const [showAllAuctions, setShowAllAuctions] = useState(false);
  // 이미 좌표가 있는 물건 id — 좌표 채우기 도구가 이 물건은 건너뛴다.
  const knownAuctionIds = useMemo(() => new Set(auctions.map((a) => a.id)), [auctions]);
  // 선택한 구의 좌표 보유 경매물건(구 필터가 없으면 전체) — 구역 포함 여부와 무관.
  // 서버가 내려주는 zoneIds는 숨긴 옛 구역도 포함하므로, 지도에 보이는(재개발닷컴) 구역 기준으로 다시 거른다.
  // 구역 포함 여부는 서버 값 대신 화면에서 경계 오차범위(toleranceM)를 적용해 다시 계산한다.
  const scopedAuctions = useMemo(() => {
    const boxes = buildZoneBoxes(mapZones);
    // 용도는 빌라(다세대·연립주택·도시형생활주택 — 경매코치 propType "빌라")만 다룬다(사용자 요청 2026-10-25).
    // 구역 안(경계 오차범위 이내)이 아니어도 구역 근처(최대 100m)면 "구역일 가능성"으로 함께 보여 준다(near=true, 지도에서 회색·숨기기 가능).
    return auctions
      .filter((a) => a.propType === "빌라")
      .map((a) => {
        // 구역 안 = 실제 다각형 안(검정). 다각형 밖이면 오차범위 이내라도 "경계 밖(근처)"(회색)로 구분한다.
        const inIds = findZoneIds(a.latitude, a.longitude, boxes, 0);
        if (inIds.length > 0) return { ...a, zoneIds: inIds, near: false };
        const nearIds = findZoneIds(a.latitude, a.longitude, boxes, Math.max(toleranceM, NEAR_BOUNDARY_MAX_M));
        return { ...a, zoneIds: nearIds, near: nearIds.length > 0 };
      });
  }, [auctions, mapZones, toleranceM]);
  // 구역 근처(경계 밖) 물건 표시 여부 — 지도의 "근처" 버튼으로 숨길 수 있다.
  const [showNear, setShowNear] = useState(false);
  const [focusAuction, setFocusAuction] = useState<{ id: string; lat: number; lng: number; nonce: number } | null>(null);
  const [auctionSearch, setAuctionSearch] = useState("");
  const [auctionSearchMessage, setAuctionSearchMessage] = useState<string | null>(null);
  const [auctionSearchMatches, setAuctionSearchMatches] = useState<RedevelopmentMapAuction[]>([]);
  const [recentAuctionSearches, setRecentAuctionSearches] = useState<RecentAuctionSearch[]>([]);
  const mapBoxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(RECENT_AUCTION_SEARCHES_KEY) ?? "[]") as RecentAuctionSearch[];
      if (Array.isArray(saved)) {
        setRecentAuctionSearches(
          saved.filter((x) => typeof x?.auctionNo === "string" && x.auctionNo.trim()).slice(0, MAX_RECENT_AUCTION_SEARCHES),
        );
      }
    } catch {
      // 저장소를 사용할 수 없으면 이번 화면에서만 검색 기능을 제공한다.
    }
  }, []);
  // 경매물건 목록 전용 구역 필터(사업종류·진행단계) — 지도·구역 목록 필터와 별개. 물건이 속한 구역 중 하나라도 맞으면 보인다.
  const [aucTypes, setAucTypes] = useState<string[]>([]);
  const [aucStages, setAucStages] = useState<string[]>([]);
  const zoneById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);
  const visibleScoped = useMemo(() => (showNear ? scopedAuctions : scopedAuctions.filter((a) => !a.near)), [scopedAuctions, showNear]);
  const guAuctions = useMemo(
    () => (guFilter ? visibleScoped.filter((a) => a.district === guFilter || a.address.includes(guFilter)) : visibleScoped),
    [visibleScoped, guFilter],
  );
  const inZoneAuctions = useMemo(
    () =>
      guAuctions
        .filter((a) => showAllAuctions || a.zoneIds.length > 0)
        .filter((a) => !selectedZoneId || a.zoneIds.includes(selectedZoneId))
        .filter(
          (a) =>
            (aucTypes.length === 0 && aucStages.length === 0) ||
            a.zoneIds.some((id) => {
              const z = zoneById.get(id);
              return !!z && zonePassesFilters(z, aucTypes, aucStages);
            }),
        ),
    [guAuctions, showAllAuctions, selectedZoneId, aucTypes, aucStages, zoneById],
  );
  // 매물 리스트의 구 필터 선택지 — 구역 안(또는 전체 보기 시 좌표 보유) 물건이 있는 구와 건수.
  const auctionGuOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of scopedAuctions) {
      if (!showAllAuctions && a.zoneIds.length === 0) continue;
      if (!a.district) continue;
      counts.set(a.district, (counts.get(a.district) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((x, y) => x[0].localeCompare(y[0], "ko"));
  }, [scopedAuctions, showAllAuctions]);
  // 이 탭만 좌우 여백 없이 꽉 차게(지도 공간 확보) — 관리자 페이지 공통 <main>의 폭 제한을 이 탭이 열려 있는 동안만 푼다.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const main = rootRef.current?.closest("main") as HTMLElement | null;
    if (!main) return;
    const prev = { maxWidth: main.style.maxWidth, paddingLeft: main.style.paddingLeft, paddingRight: main.style.paddingRight };
    main.style.maxWidth = "none";
    main.style.paddingLeft = "8px";
    main.style.paddingRight = "8px";
    return () => {
      main.style.maxWidth = prev.maxWidth;
      main.style.paddingLeft = prev.paddingLeft;
      main.style.paddingRight = prev.paddingRight;
    };
  }, []);
  // 조사로 저장된 호가·실거래 — 지도 가격 라벨용(조사가 끝나면 패널이 이 쿼리를 무효화한다).
  const { data: researchPoints = null } = useQuery({
    queryKey: ["redev-map-points"],
    queryFn: fetchResearchMapPoints,
    staleTime: 30_000,
  });
  const [listStartError, setListStartError] = useState<string | null>(null);
  const [blogOnlyResearch, setBlogOnlyResearch] = useState(false);
  const [blogConsentByZoneId, setBlogConsentByZoneId] = useState<Record<string, { yesPct: number | null; noPct: number | null; postedAt: string } | null>>({});
  const startResearchFromList = useCallback(
    async (zoneId: string) => {
      setListStartError(null);
      try {
        if (blogOnlyResearch) {
          const blog = await refreshZoneBlog(zoneId);
          setBlogConsentByZoneId((previous) => ({
            ...previous,
            [zoneId]: blog.consent ? { yesPct: blog.consent.yesPct, noPct: blog.consent.noPct, postedAt: blog.consent.postedAt } : null,
          }));
        } else {
          await startZoneResearch(zoneId, undefined, readFastResearch());
        }
      } catch (e) {
        setListStartError(e instanceof Error ? e.message : "조사를 시작하지 못했습니다.");
      }
      await queryClient.invalidateQueries({ queryKey: ["redev-zone-runs"] });
      await queryClient.invalidateQueries({ queryKey: ["redev-zone-consents"] });
    },
    [blogOnlyResearch, queryClient],
  );
  // 체크한 구역을 순서대로 조사하는 큐 — 서버가 한 번에 한 구역만 돌리므로, 한 구역이 끝나면(done/error/중단) 다음 구역을 시작한다.
  // 브라우저 탭이 열려 있는 동안만 이어진다(탭을 닫으면 진행 중인 구역까지만 끝나고 멈춘다).
  const [checkedZoneIds, setCheckedZoneIds] = useState<Set<string>>(() => new Set());
  const filteredZoneIds = useMemo(() => groupedZones.flatMap(([, list]) => list.map((zone) => zone.id)), [groupedZones]);
  const allFilteredChecked = filteredZoneIds.length > 0 && filteredZoneIds.every((id) => checkedZoneIds.has(id));
  const [queue, setQueue] = useState<{ total: number; done: number; currentId: string | null } | null>(null);
  const queueCancelRef = useRef(false);
  const toggleChecked = useCallback((id: string) => {
    setCheckedZoneIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const runQueue = useCallback(
    async (ids: string[]) => {
      if (!ids.length || queue) return;
      queueCancelRef.current = false;
      setListStartError(null);
      let done = 0;
      setQueue({ total: ids.length, done, currentId: null });
      for (const id of ids) {
        if (queueCancelRef.current) break;
        setQueue({ total: ids.length, done, currentId: id });
        try {
          if (blogOnlyResearch) {
            const blog = await refreshZoneBlog(id);
            setBlogConsentByZoneId((previous) => ({
              ...previous,
              [id]: blog.consent ? { yesPct: blog.consent.yesPct, noPct: blog.consent.noPct, postedAt: blog.consent.postedAt } : null,
            }));
          } else {
            await startZoneResearch(id, undefined, readFastResearch());
          }
        } catch (e) {
          setListStartError(e instanceof Error ? e.message : "조사를 시작하지 못했습니다.");
          break;
        }
        await queryClient.invalidateQueries({ queryKey: ["redev-zone-runs"] });
        await queryClient.invalidateQueries({ queryKey: ["redev-zone-consents"] });
        // 끝날 때까지 4초마다 확인(최대 40분).
        for (let i = 0; !blogOnlyResearch && i < 600 && !queueCancelRef.current; i += 1) {
          await new Promise((r) => setTimeout(r, 4000));
          const runs = await fetchZoneRuns().catch(() => null);
          if (!runs) continue;
          const cur = runs.find((r) => r.zoneId === id);
          if (!cur || cur.status !== "running") break;
        }
        await queryClient.invalidateQueries({ queryKey: ["redev-zone-runs"] });
        await queryClient.invalidateQueries({ queryKey: ["redev-zone-consents"] });
        done += 1;
        setCheckedZoneIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
      setQueue(null);
    },
    [blogOnlyResearch, queryClient, queue],
  );
  const [selectedAuctionId, setSelectedAuctionId] = useState<string | null>(null);
  // 지도에서 구역(라벨·다각형)을 누르면 열리는 구역 팝업 — 구역 정보·구역 안 경매물건·호가/실거래 조사.
  const [zonePopupId, setZonePopupId] = useState<string | null>(null);
  const zonePopup = useMemo(() => zones.find((z) => z.id === zonePopupId) ?? null, [zones, zonePopupId]);
  const selectedAuction = useMemo(
    () => scopedAuctions.find((a) => a.id === selectedAuctionId) ?? auctions.find((a) => a.id === selectedAuctionId) ?? null,
    [scopedAuctions, auctions, selectedAuctionId],
  );
  // 비교용 브라우저 팝업은 URL의 사건 물건을 읽어, 일반 상세창과 동일한 레이아웃으로 바로 연다.
  useEffect(() => {
    const popupAuctionId = new URLSearchParams(window.location.search).get("auctionId");
    if (!popupAuctionId || auctions.length === 0) return;
    const auction = auctions.find((item) => item.id === popupAuctionId);
    if (!auction) return;
    setSelectedAuctionId(auction.id);
    setFocusAuction({ id: auction.id, lat: auction.latitude, lng: auction.longitude, nonce: Date.now() });
  }, [auctions]);
  const mapAuctions = useMemo(
    // 구·동 필터는 지도를 그 지역으로 옮기는 용도라 지도 위 경매 라벨은 구와 상관없이 전부 둔다(지도를 움직이면 다른 지역도 보인다).
    () => {
      const base = visibleScoped.filter((a) => showAllAuctions || a.zoneIds.length > 0);
      // 사건번호 검색 결과는 현재 구역/근처 필터 밖이어도 지도에서 반드시 찾을 수 있게 한다.
      const focused = focusAuction ? auctions.find((a) => a.id === focusAuction.id) : undefined;
      return focused && !base.some((a) => a.id === focused.id) ? [...base, focused] : base;
    },
    [visibleScoped, showAllAuctions, focusAuction, auctions],
  );

  const normalizeAuctionNo = (value: string) => value.replace(/[\s-]/g, "").toLowerCase();
  const saveRecentAuctionSearch = (value: string) => {
    const auctionNo = value.trim();
    if (!auctionNo) return;
    setRecentAuctionSearches((previous) => {
      const compactNo = normalizeAuctionNo(auctionNo);
      const next = [{ auctionNo, searchedAt: Date.now() }, ...previous.filter((x) => {
        const oldNo = normalizeAuctionNo(x.auctionNo);
        // 예전에 저장된 "3257" 같은 축약 검색어는, 실제 사건번호를 선택하면 교체한다.
        return oldNo !== compactNo && (x.auctionNo.includes("타경") || !compactNo.endsWith(oldNo));
      })].slice(
        0,
        MAX_RECENT_AUCTION_SEARCHES,
      );
      try {
        localStorage.setItem(RECENT_AUCTION_SEARCHES_KEY, JSON.stringify(next));
      } catch {
        // 브라우저 저장소가 막힌 환경에서도 검색 자체는 계속 가능하다.
      }
      return next;
    });
  };
  const focusAuctionOnMap = (auction: RedevelopmentMapAuction) => {
    setAuctionSearchMatches([]);
    setAuctionSearchMessage(`${auction.auctionNo}${auction.court ? ` · ${auction.court}` : ""} 물건을 지도에서 표시했습니다.`);
    setShowNear(true);
    setSelectedAuctionId(auction.id);
    setFocusAuction({ id: auction.id, lat: auction.latitude, lng: auction.longitude, nonce: Date.now() });
    mapBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const openComparisonAuctionOnMap = (auction: RedevelopmentMapAuction) => {
    setShowNear(true);
    setFocusAuction({ id: auction.id, lat: auction.latitude, lng: auction.longitude, nonce: Date.now() });
    mapBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const popupUrl = new URL("/admin/auction-popup", window.location.origin);
    popupUrl.searchParams.set("auctionId", auction.id);
    window.open(popupUrl.toString(), `auction-compare-${auction.id}`, "popup=yes,width=1500,height=960,resizable=yes,scrollbars=yes");
  };
  const searchAuctionOnMap = (searchValue = auctionSearch) => {
    const keyword = normalizeAuctionNo(searchValue);
    if (!keyword) {
      setAuctionSearchMessage("사건번호를 입력해 주세요.");
      return;
    }
    const exact = auctions.filter((a) => normalizeAuctionNo(a.auctionNo) === keyword);
    const matches = exact.length ? exact : auctions.filter((a) => normalizeAuctionNo(a.auctionNo).includes(keyword));
    if (matches.length === 0) {
      setAuctionSearchMatches([]);
      setAuctionSearchMessage("좌표가 등록된 경매물건 중 일치하는 사건번호가 없습니다.");
      return;
    }
    if (matches.length === 1) {
      saveRecentAuctionSearch(matches[0].auctionNo);
      focusAuctionOnMap(matches[0]);
      return;
    }
    setAuctionSearchMatches(matches.slice(0, 8));
    setAuctionSearchMessage(`같은 번호의 물건이 ${matches.length}건입니다. 법원을 확인해 선택해 주세요.`);
  };

  return (
    <div ref={rootRef} className="p-1 sm:p-2 space-y-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-bold text-foreground">재개발물건</h2>
        <p className="text-xs text-muted-foreground">
          좌측에서 구역·물건을 확인하고, 우측 지도에서 구역을 클릭하면 그 구역 안 경매물건이 나옵니다.
        </p>
      </div>

      {message && (
        <div className="text-sm px-3 py-2 rounded-sm border border-border bg-secondary/30">
          {message}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={load} disabled={loading} className="text-xs text-primary hover:underline disabled:opacity-50">
          {loading ? "불러오는 중..." : "새로고침"}
        </button>
        {!drawing && !imageTracing && !pendingPoints && (
          <>
            <button
              type="button"
              onClick={startNewZone}
              className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-primary text-primary-foreground"
            >
              + 새 구역 그리기
            </button>
            <button
              type="button"
              onClick={startNewZoneFromImage}
              className="px-3 py-1.5 text-xs font-semibold rounded-sm border border-primary text-primary hover:bg-primary/5"
            >
              + 이미지로 구역 그리기
            </button>
          </>
        )}
        {drawing && (
          <button type="button" onClick={cancelDrawing} className="text-xs text-destructive hover:underline">
            그리기 취소
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowZoneUpdateInfo((v) => !v)}
          className="px-3 py-1.5 text-xs font-semibold rounded-sm border border-border text-foreground hover:bg-muted"
        >
          구역도 업데이트
        </button>
        <div className="relative ml-auto">
          <form
            className="flex items-center gap-1.5 rounded-md border-2 border-primary bg-primary/5 p-1.5 shadow-sm"
            onSubmit={(e) => {
              e.preventDefault();
              searchAuctionOnMap();
            }}
          >
            <label htmlFor="auction-map-search" className="whitespace-nowrap px-1 text-xs font-bold text-foreground">
              경매 사건번호 찾기
            </label>
            <input
              id="auction-map-search"
              value={auctionSearch}
              onChange={(e) => {
                setAuctionSearch(e.target.value);
                setAuctionSearchMessage(null);
                setAuctionSearchMatches([]);
              }}
              placeholder="예: 2025타경12345"
              className="w-44 rounded border border-border bg-background px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
            />
            <button type="submit" className="rounded bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90">
              지도에서 찾기
            </button>
          </form>
          {(auctionSearchMessage || recentAuctionSearches.length > 0) && (
            <div className="absolute right-0 top-full z-30 mt-1 flex w-max max-w-[min(620px,calc(100vw-24px))] flex-wrap items-center gap-1.5 rounded-md border border-primary/30 bg-background px-2 py-1.5 text-xs text-muted-foreground shadow-lg">
              {auctionSearchMessage && <span>{auctionSearchMessage}</span>}
              {auctionSearchMatches.map((auction) => (
                <button
                  key={auction.id}
                  type="button"
                  onClick={() => {
                    saveRecentAuctionSearch(auction.auctionNo);
                    focusAuctionOnMap(auction);
                  }}
                  className="rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 font-semibold text-primary hover:bg-primary/10"
                >
                  {auction.auctionNo}{auction.court ? ` · ${auction.court}` : ""}
                </button>
              ))}
              {recentAuctionSearches.length > 0 && (
                <>
                  <span className="ml-1 whitespace-nowrap border-l border-border pl-2 font-semibold text-foreground">최근 검색</span>
                  {recentAuctionSearches.map((recent) => (
                    <button
                      key={normalizeAuctionNo(recent.auctionNo)}
                      type="button"
                      onClick={() => {
                        setAuctionSearch(recent.auctionNo);
                        searchAuctionOnMap(recent.auctionNo);
                      }}
                      className="rounded border border-amber-500/50 bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-800 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200"
                      title={`${new Date(recent.searchedAt).toLocaleString("ko-KR")} 검색`}
                    >
                      {recent.auctionNo}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setRecentAuctionSearches([]);
                      try {
                        localStorage.removeItem(RECENT_AUCTION_SEARCHES_KEY);
                      } catch {
                        // 저장소가 막힌 환경에서는 현재 화면 목록만 비운다.
                      }
                    }}
                    className="whitespace-nowrap text-muted-foreground hover:text-destructive hover:underline"
                  >
                    비우기
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showZoneUpdateInfo && (
        <div className="rounded-sm border border-border bg-card px-4 py-3 text-xs space-y-1.5">
          <p className="font-semibold text-foreground">재개발닷컴 구역도 업데이트</p>
          <p className="text-muted-foreground">
            지금 반영된 재개발닷컴 구역 <b className="text-foreground">{allJaegebalZones.length.toLocaleString("ko-KR")}개</b>
            {jaegebalLastUpdatedAt ? ` · 마지막 반영 ${new Date(jaegebalLastUpdatedAt).toLocaleString("ko-KR")}` : ""}
          </p>
          <p className="text-muted-foreground">
            재개발닷컴에 새로 생긴 구역은 이 화면에서 바로 가져올 수 없습니다. 재개발닷컴에 봇 확인 화면이 있고 서버에는
            브라우저가 없어서, 관리자 PC에서 창을 띄워 보안 확인을 직접 풀고 수집해야 합니다.
          </p>
          <p className="text-muted-foreground">
            업데이트가 필요하면 Claude에게 <b className="text-foreground">&quot;재개발닷컴 구역도 업데이트해줘&quot;</b>라고 요청해 주세요.
            수집이 끝나면 이 화면의 "새로고침"으로 반영된 구역을 확인할 수 있습니다.
          </p>
        </div>
      )}

      {pendingPoints && (
        <div className="rounded-sm border border-primary/40 bg-primary/5 p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">
            {editingZone ? `"${editingZone.name}" 구역 경계 수정 저장` : "새 구역 정보 입력"}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              (꼭짓점 {pendingPoints.length}개)
            </span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="구역명 (필수)"
              className="px-2 py-1.5 text-sm border border-border rounded-sm bg-background"
            />
            <input
              value={form.region}
              onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
              placeholder="지역명 (예: 서울특별시 강동구)"
              className="px-2 py-1.5 text-sm border border-border rounded-sm bg-background"
            />
            <input
              value={form.stage}
              onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))}
              placeholder="사업단계"
              list="redevelopment-stage-options"
              className="px-2 py-1.5 text-sm border border-border rounded-sm bg-background"
            />
            <input
              value={form.memo}
              onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
              placeholder="메모(선택)"
              className="px-2 py-1.5 text-sm border border-border rounded-sm bg-background"
            />
          </div>
          <datalist id="redevelopment-stage-options">
            {STAGE_OPTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSaveDraft()}
              disabled={saving || !form.name.trim()}
              className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingPoints(null);
                setEditingZone(null);
              }}
              className="text-xs text-muted-foreground hover:underline"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 재개발닷컴식 레이아웃: 좌측 정보 패널(스크롤) + 우측 큰 지도 */}
      <div className="flex flex-col lg:flex-row border border-border rounded-sm overflow-hidden lg:h-[calc(100vh-170px)] lg:min-h-[640px]">
        <div ref={mapBoxRef} className="h-[65vh] lg:h-auto lg:flex-1 min-w-0 lg:order-2">
          <RedevelopmentEditMapView
            fillHeight
            focusGu={guFilter}
            focusDong={dongFilter}
            toolbar={
              <div className="flex flex-wrap items-center gap-1.5">
                <RedevelopmentEditZoneFilters types={mapTypes} stages={mapStages} onTypesChange={setMapTypes} onStagesChange={setMapStages} />
                <button
                  type="button"
                  onClick={() => setMapCurrentAuctionOnly((value) => !value)}
                  className={`rounded-sm border px-2.5 py-1.5 text-xs font-semibold shadow-sm ${mapCurrentAuctionOnly ? "border-blue-600 bg-blue-600 text-white" : "border-border bg-background text-foreground hover:bg-muted"}`}
                  title="현재 진행 중인 경매물건이 연결된 구역 경계만 지도에 표시합니다."
                >
                  경매물건 있는 구역만
                </button>
              </div>
            }
            zones={mapDisplayZones}
            auctions={mapAuctions}
            selectedZoneId={selectedZoneId}
            zoneFocusNonce={zoneFocusNonce}
            onZoneClick={(id) => {
              setSelectedZoneId(id);
              if (!drawing) setZonePopupId(id);
            }}
            showNear={showNear}
            focusAuction={focusAuction}
            onShowNearChange={setShowNear}
            researchPoints={researchPoints}
            toleranceM={toleranceM}
            onAuctionClick={setSelectedAuctionId}
            selectedAuctionId={selectedAuctionId}
            drawing={drawing}
            editingZone={editingZone}
            onFinishDraw={handleFinishDraw}
            draftPointCount={draftPointCount}
            onDraftPointCountChange={setDraftPointCount}
          />
        </div>

        <div className="lg:w-[440px] lg:shrink-0 lg:order-1 overflow-y-auto border-t lg:border-t-0 lg:border-r border-border bg-background p-3 flex flex-col gap-4 max-h-[70vh] lg:max-h-none">
          <div className="order-4 flex flex-col rounded-lg border border-slate-200 bg-white shadow-sm lg:min-h-0 lg:flex-1">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <span className="text-sm font-bold text-slate-900">구역 목록</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{filteredCount === zones.length ? zones.length : `${filteredCount} / ${zones.length}`}개</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-slate-50/80 px-4 py-3 text-xs">
              {queue ? (
                <>
                  <span className="font-semibold text-blue-700">
                    순차 조사 {Math.min(queue.done + 1, queue.total)}/{queue.total}
                    {queue.currentId ? ` · ${zones.find((z) => z.id === queue.currentId)?.name ?? ""}` : ""}
                  </span>
                  <button type="button" onClick={() => (queueCancelRef.current = true)} className="rounded-sm border border-border px-2 py-0.5 text-foreground hover:bg-muted">
                    중지(현재 구역까지만)
                  </button>
                </>
              ) : (
                <div className="w-full space-y-2">
                  <div className={`font-medium ${blogOnlyResearch ? "text-amber-700" : "text-slate-500"}`}>
                    {blogOnlyResearch ? "현재 모드: 블로그만" : "현재 모드: 전체 구역 조사(블로그·매물·실거래)"}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <button
                    type="button"
                    disabled={checkedZoneIds.size === 0}
                    onClick={() => void runQueue(Array.from(checkedZoneIds))}
                    className="rounded-md bg-slate-800 px-3 py-1.5 font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    조사 시작 ({checkedZoneIds.size})
                  </button>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 font-semibold text-slate-700" title="체크하면 네이버 부동산 매물·실거래 수집 없이 재개발 블로그를 조사합니다.">
                      <input className="h-3.5 w-3.5 accent-amber-600" type="checkbox" checked={blogOnlyResearch} onChange={(event) => setBlogOnlyResearch(event.target.checked)} />
                      블로그 조사만
                    </label>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 px-4 pt-3 text-xs">
              <select
                value={guFilter}
                onChange={(e) => {
                  setGuFilter(e.target.value);
                  setDongFilter("");
                }}
                className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-slate-700"
              >
                <option value="">구 전체</option>
                {guOptions.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <select
                value={dongFilter}
                onChange={(e) => setDongFilter(e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-slate-700"
              >
                <option value="">동 전체</option>
                {dongOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              {(guFilter || dongFilter || interestOnly || currentAuctionOnly || completedOnly || listTypes.length > 0 || listStages.length > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setGuFilter("");
                    setDongFilter("");
                    setInterestOnly(false);
                    setCurrentAuctionOnly(false);
                    setCompletedOnly(false);
                    setListTypes([]);
                    setListStages([]);
                  }}
                  className="shrink-0 rounded px-1 py-1 font-medium text-slate-500 hover:text-slate-900 hover:underline"
                >
                  초기화
                </button>
              )}
            </div>
            <div className="border-b border-slate-100 px-4 pb-3 pt-2 text-xs">
              <RedevelopmentEditZoneFilters types={listTypes} stages={listStages} onTypesChange={setListTypes} onStagesChange={setListStages} compact />
            </div>
            {completedOnly && zoneRunsError && <div className="px-3 py-2 border-b border-border text-xs text-red-600">조사 상태를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>}
            {listStartError && <div className="px-3 py-2 border-b border-border text-xs text-red-600">{listStartError}</div>}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-4 py-2 text-xs">
              <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 font-semibold text-slate-700" title="접힌 구역까지 포함해 현재 필터에 맞는 모든 구역을 선택합니다. 해제 시 선택된 구역을 모두 해제합니다.">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-blue-600"
                  aria-label="현재 필터에 맞는 구역 전체 선택"
                  checked={allFilteredChecked}
                  disabled={!!queue || filteredZoneIds.length === 0}
                  ref={(node) => { if (node) node.indeterminate = filteredZoneIds.some((id) => checkedZoneIds.has(id)) && !allFilteredChecked; }}
                  onChange={(event) => setCheckedZoneIds(event.target.checked ? new Set(filteredZoneIds) : new Set())}
                />
                전체 선택
              </label>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <label className={`inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 font-medium ${currentAuctionOnly ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`} title="현재 진행 중인 경매물건이 연결된 구역만 표시합니다.">
                  <input className="h-3 w-3 accent-blue-600" type="checkbox" aria-label="현재 경매물건 있는 구역만" checked={currentAuctionOnly} onChange={(event) => setCurrentAuctionOnly(event.target.checked)} />
                  진행 경매
                </label>
                <label className={`inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 font-medium ${completedOnly ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`} title="전체 조사 완료로 표시된 구역만 보여 줍니다.">
                  <input className="h-3 w-3 accent-blue-600" type="checkbox" aria-label="조사 완료 구역만" checked={completedOnly} onChange={(event) => setCompletedOnly(event.target.checked)} />
                  조사 완료
                </label>
                <button type="button" onClick={() => setInterestOnly((v) => !v)} aria-pressed={interestOnly} aria-label={`관심 구역만 보기 (${interestCount}개)`} title={`관심 구역만 보기 (${interestCount}개)`} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-semibold ${interestOnly ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-500 hover:bg-amber-50 hover:text-amber-700"}`}>
                  <span aria-hidden="true">★</span><span>{interestCount}</span>
                </button>
              </div>
            </div>
            <ul className="divide-y divide-border max-h-[30vh] overflow-y-auto lg:min-h-0 lg:max-h-none lg:flex-1">
              {listGroups.flatMap(([district, list]) => [
                <li
                  key={`district-${district}`}
                  className="sticky top-0 z-10 border-y border-slate-200 bg-slate-100/95 px-4 py-1.5 text-xs font-bold text-slate-600"
                >
                  <div className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      aria-label={`${district} 전체 구역 선택`}
                      title={`${district}의 필터에 맞는 전체 구역을 선택하거나 해제합니다.`}
                      className="h-3.5 w-3.5 accent-blue-600"
                      disabled={!!queue}
                      checked={(fullGroupByDistrict.get(district) ?? []).length > 0 && (fullGroupByDistrict.get(district) ?? []).every((zone) => checkedZoneIds.has(zone.id))}
                      ref={(node) => { const group = fullGroupByDistrict.get(district) ?? []; if (node) node.indeterminate = group.some((zone) => checkedZoneIds.has(zone.id)) && !group.every((zone) => checkedZoneIds.has(zone.id)); }}
                      onChange={(event) => {
                        const shouldSelect = event.target.checked;
                        setCheckedZoneIds((previous) => {
                          const next = new Set(previous);
                          for (const zone of fullGroupByDistrict.get(district) ?? []) shouldSelect ? next.add(zone.id) : next.delete(zone.id);
                          return next;
                        });
                      }}
                    />
                    <button type="button" onClick={() => setExpandedDistrict(openDistrict === district ? null : district)} aria-expanded={openDistrict === district} className="flex min-w-0 flex-1 items-center justify-between gap-2 py-0.5 text-left hover:text-slate-900">
                      <span>{district} ({groupSize.get(district) ?? list.length}개)</span>
                      <span aria-hidden="true">{openDistrict === district ? "▴" : "▾"}</span>
                    </button>
                  </div>
                </li>,
                ...list.map((zone) => (
                <li key={zone.id} className={`space-y-2 px-4 py-3 text-xs transition-colors ${selectedZoneId === zone.id ? "bg-blue-50/40" : "bg-white hover:bg-slate-50/70"}`}>
                      <div className="flex items-start gap-1.5">
                        <input
                          type="checkbox"
                          checked={checkedZoneIds.has(zone.id)}
                          disabled={!!queue}
                          onChange={() => toggleChecked(zone.id)}
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-blue-600"
                          title="순차 조사할 구역으로 선택"
                        />
                        <button
                          type="button"
                          onClick={() => handleZoneClick(zone.id)}
                          className={`block min-w-0 flex-1 text-left text-sm font-bold ${
                            selectedZoneId === zone.id ? "text-primary" : "text-foreground"
                          }`}
                        >
                          {zone.name}
                        </button>
                        {(() => {
                          const consent = consentByZoneId.get(zone.id);
                          if (!consent || (consent.yesPct == null && consent.noPct == null)) return null;
                          return (
                            <span className="shrink-0 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-sm font-bold leading-tight text-blue-700" title={`블로그 추정 · 공식 수치 아님 · ${consent.postedAt} 글 기준`}>
                              {[consent.yesPct != null ? `찬성 ${consent.yesPct}%${consent.qualifier ?? ""}` : "", consent.noPct != null ? `반대 ${consent.noPct}%${consent.qualifier ?? ""}` : ""].filter(Boolean).join(" · ")}
                            </span>
                          );
                        })()}
                        <button
                          type="button"
                          onClick={() => void toggleInterest(zone)}
                          title={zone.isInterest ? "관심 구역 해제" : "관심 구역으로 표시"}
                          className={`shrink-0 rounded px-1 text-lg leading-none ${zone.isInterest ? "text-amber-500" : "text-slate-300 hover:text-amber-500"}`}
                        >
                          {zone.isInterest ? "★" : "☆"}
                        </button>
                      </div>
                      <div className="pl-5 text-slate-500">
                        {zone.region || "-"} · {zoneBusinessTypeLabel(zone)} {zone.stage && `· ${zone.stage}`}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 pl-5 text-xs" title="구역 경계 안의 좌표가 확인된 빌라 기준입니다. 낙찰가가 있거나 사건이 종결된 물건은 제외하며 사건 상태가 없는 물건은 별도 표시합니다.">
                        <span className="font-semibold text-slate-700">진행 중 경매 {auctionCountsLoaded ? `${auctionCountsByZoneId.get(zone.id)?.active ?? 0}건` : loading ? "확인 중" : "확인 불가"}</span>
                        {auctionCountsLoaded && !!auctionCountsByZoneId.get(zone.id)?.unknown && <span className="text-slate-500">상태 미확인 {auctionCountsByZoneId.get(zone.id)!.unknown}건</span>}
                      </div>
                      {(() => {
                        const position = stagePosition(zone.stage);
                        if (position == null) return <div className="text-muted-foreground">진행 단계 위치 미확인</div>;
                        const { color, dashed, completed } = zoneStyle(zone);
                        return (
                          <div className="space-y-1.5 pl-5" title="색상은 지도의 사업종류 색과 동일하며, 점선은 추진 준비 구역을 나타냅니다. 사업 방식에 따라 절차와 순서가 달라질 수 있습니다.">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-semibold" style={{ color, opacity: completed ? 0.65 : 1 }}>현재: {stageDisplayLabel(zone.stage)}</span>
                              <span className="text-muted-foreground">{position + 1} / {PROGRESS_STEPS.length}단계</span>
                            </div>
                            <ol className="flex gap-1" aria-label={`사업 절차 참고 단계, 현재 ${stageDisplayLabel(zone.stage)}`}>
                              {PROGRESS_STEPS.map((step, index) => (
                                <li key={step} aria-current={index === position ? "step" : undefined} title={step} className="h-2.5 min-w-0 flex-1 rounded-sm border" style={{
                                  borderColor: index <= position ? color : "#d1d5db",
                                  borderStyle: index <= position && dashed ? "dashed" : "solid",
                                  backgroundColor: index === position && !dashed && !completed ? color : index <= position && !completed ? `${color}25` : "transparent",
                                  opacity: completed && index <= position ? 0.4 : 1,
                                }} />
                              ))}
                            </ol>
                          </div>
                        );
                      })()}
                      {zone.memo && <div className="text-muted-foreground">{zone.memo}</div>}
                      {(() => {
                        // 블로그 갱신 등으로 만들어진 빈 기록(idle·시작 안 함)은 조사한 적 없는 것으로 본다.
                        const rawRun = runByZoneId.get(zone.id);
                        const hasBlogResult = Object.prototype.hasOwnProperty.call(blogConsentByZoneId, zone.id);
                        const run = rawRun && ((rawRun.status !== "idle" && rawRun.startedAt) || rawRun.finishedAt) ? rawRun : undefined;
                        const running = run?.status === "running";
                        const done = run?.status === "done" || (run?.finishedAt && run.status !== "running");
                        const when = run?.finishedAt ? new Date(run.finishedAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }) : "";
                        return (
                          <div className="flex flex-wrap items-center gap-2 pl-5">
                            <span
                              className={`rounded px-1.5 py-0.5 font-semibold ${
                                running
                                  ? "bg-blue-100 text-blue-700"
                                  : done
                                    ? "bg-green-100 text-green-700"
                                    : run
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-muted text-muted-foreground"
                              }`}
                              title={run ? `호가 ${run.naverSaved}건 · 실거래 ${run.tradesSaved}건 저장` : undefined}
                            >
                              {running ? `조사 중 · ${run?.phase ?? ""}` : done ? `전체 조사 완료 ${when}` : hasBlogResult ? "구역 블로그 조사 완료" : run ? (run.status === "error" ? "조사 오류" : "조사 중단됨") : "미조사"}
                            </span>
                            <button
                              type="button"
                              disabled={running}
                              onClick={() => void startResearchFromList(zone.id)}
                              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                            >
                              {blogOnlyResearch ? "블로그 조사" : run ? "전체 다시 조사" : "전체 조사"}
                            </button>
                          </div>
                        );
                      })()}
                </li>
                )),
              ])}
              {listLimited && (
                <li className="p-3 text-xs text-muted-foreground">
                  열린 구역의 앞쪽 {LIST_LIMIT}개만 표시했습니다. 구·동 필터를 선택하면 나머지도 볼 수 있습니다. 전체 선택은 표시 제한과 관계없이 적용됩니다.
                </li>
              )}
              {zones.length === 0 && !loading && (
                <li className="p-3 text-xs text-muted-foreground">등록된 구역이 없습니다.</li>
              )}
            </ul>
          </div>

        </div>
      </div>

      {zonePopup && (
        <RedevelopmentEditSelectedZone
          key={zonePopup.id}
          zone={zonePopup}
          auctions={visibleScoped.filter((a) => a.zoneIds.includes(zonePopup.id))}
          toleranceM={toleranceM}
          // 구역 팝업은 그대로 두고 그 위에 경매 상세를 띄운다(닫으면 구역 팝업이 남아 있음).
          onAuctionClick={setSelectedAuctionId}
          onClose={() => setZonePopupId(null)}
          onToggleInterest={toggleInterest}
          onSaveInfo={handleSaveInfo}
          onDelete={async (zone) => {
            if (await handleDeleteZone(zone)) setZonePopupId(null);
          }}
        />
      )}

      {selectedAuction && (
        <RedevelopmentEditSelectedAuction
          key={selectedAuction.id}
          auction={selectedAuction}
          toleranceM={toleranceM}
          onClose={() => setSelectedAuctionId(null)}
          onNavigateAuction={openComparisonAuctionOnMap}
        />
      )}

      <RedevelopmentEditAuctionList
        auctions={inZoneAuctions}
        allAuctions={scopedAuctions}
        zoneNameById={zoneNameById}
        selectedZoneId={selectedZoneId}
        onZoneSelect={(id) => setSelectedZoneId(id)}
        onClearZone={() => setSelectedZoneId(null)}
        guLabel={guFilter}
        guOptions={auctionGuOptions}
        onGuChange={(g) => {
          setGuFilter(g);
          setDongFilter("");
        }}
        toleranceM={toleranceM}
        onToleranceChange={setToleranceM}
        showAll={showAllAuctions}
        onShowAllChange={setShowAllAuctions}
        onFocusAuction={(a) => {
          setFocusAuction({ ...a, nonce: Date.now() });
          // 목록은 지도 아래에 있으므로 지도가 보이도록 위로 올린다.
          mapBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
        filterSlot={
          <div className="flex items-center gap-2">
            <RedevelopmentEditZoneFilters types={aucTypes} stages={aucStages} onTypesChange={setAucTypes} onStagesChange={setAucStages} />
            <button
              type="button"
              onClick={() => setAucStages(aucStages.length === 1 && aucStages[0] === "연번부여" ? [] : ["연번부여"])}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${aucStages.length === 1 && aucStages[0] === "연번부여" ? "border-red-500 bg-red-50 text-red-700" : "border-border bg-card text-foreground"}`}
              title="연번부여 단계 구역에 속한 물건만 보기"
            >
              연번부여만
            </button>
            {(aucTypes.length > 0 || aucStages.length > 0) && (
              <button type="button" onClick={() => { setAucTypes([]); setAucStages([]); }} className="text-xs text-muted-foreground hover:underline">
                구역 필터 해제
              </button>
            )}
          </div>
        }
      />

      <RedevelopmentTraceFailurePanel />

      {imageTracing && (
        <RedevelopmentImageTraceTool
          // 구역이 바뀌면 통째로 새로 열리게 한다 — 도구가 내부 상태(이미지·
          // 추출 결과·기준점)를 들고 있어서, key 없이 props만 바꾸면 이전
          // 구역 화면이 그대로 남는다(사용자 리포트, 2026-08-06).
          key={editingZone?.id ?? "new"}
          existingPolygon={editingZone?.polygon ?? null}
          existingIsRefined={
            editingZone?.boundaryType === "MANUAL" || editingZone?.boundaryType === "IMAGE_AUTO"
          }
          zoneName={editingZone?.name ?? null}
          zoneId={editingZone?.id ?? null}
          onComplete={handleFinishImageTrace}
          onCancel={() => {
            setImageTracing(false);
            setImageTraceSourceUrl(null);
            setImageTraceCenter(null);
            setImageTraceArea(null);
          }}
          initialImageUrl={imageTraceSourceUrl}
          initialCenter={imageTraceCenter}
          areaSqMeters={imageTraceArea}
        />
      )}
    </div>
  );
}
