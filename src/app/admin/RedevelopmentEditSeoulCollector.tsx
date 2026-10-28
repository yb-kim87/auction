"use client";

import { useRef, useState } from "react";
import {
  bulkUpsertRedevelopmentZones,
  fetchSeoulUpisPage,
  geocodeAddress,
  type SeoulUpisRow,
} from "@/lib/api";
import { buildApproxPolygon } from "@/lib/convex-hull";

const SOURCE = "PUBLIC_API";
const SOURCE_DATASET_ID = "seoul-upisRebuild";
const PAGE_SIZE = 1000;
const GEOCODE_CONCURRENCY = 5;
/** 한 번 클릭에 지오코딩·저장할 구역 상한 — 전체가 수천 건이라 한 번에
 * 다 돌리면 너무 오래 걸린다. 남은 건 "이어서 수집"으로 계속한다. */
const BATCH_LIMIT = 200;

/** 위치명(PSTN_NM)의 "일대"/"일원"/"(N필지)" 같은 접미사를 제거해
 * 지오코딩이 잘 먹는 지번 형태로 정제한다(설계 §2.2). */
function cleanPstnNm(raw: string): string {
  return raw
    .replace(/\(\s*\d+\s*필지\s*\)/g, "")
    .replace(/일대|일원/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveStage(rptType: string): string {
  if (rptType === "폐지") return "해제됨";
  if (rptType === "신설" || rptType === "변경") return "지정됨";
  return rptType || "확인필요";
}

type GeoRing = number[][];
type GeoFeature = { properties: { name: string; gu?: string }; geometry: { type: string; coordinates: GeoRing[] | GeoRing[][] } };

function pointInRing(lat: number, lng: number, ring: GeoRing): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInFeature(lat: number, lng: number, f: GeoFeature): boolean {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates as GeoRing[]] : (f.geometry.coordinates as GeoRing[][]);
  return polys.some((poly) => pointInRing(lat, lng, poly[0]));
}

/** "시흥1동" → "시흥동" — 위치명(PSTN_NM)은 법정동 이름이라 번호를 뗀다. */
function baseDongName(name: string): string {
  return name.replace(/제?\d+(·\d+)*동$/, "동");
}

type ZoneGroup = {
  prjcCd: string;
  name: string;
  region: string;
  stage: string;
  projectType: string;
  address: string;
  /** 구역 실제 면적(㎡) — 원 크기를 이걸로 맞춘다(위치는 근사여도 크기는
   * 실제와 비슷하게, 2026-08-04). "변경 후 면적"을 우선하고 없으면
   * "변경 전 면적"을 쓴다. */
  areaSqMeters: number | undefined;
};

function parseArea(value: string): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** upisRebuild 원본 행들을 프로젝트(PRJC_CD) 단위로 묶어, 각 프로젝트의
 * 가장 최신 이력(RPT_MNG_CD가 사전식으로 가장 큰 행 — 관리코드에 날짜가
 * 앞에 박혀 있어 문자열 비교로 최신 판별 가능)만 남긴다. */
function groupLatestByProject(rows: SeoulUpisRow[]): ZoneGroup[] {
  const latestByProject = new Map<string, SeoulUpisRow>();
  for (const row of rows) {
    const prev = latestByProject.get(row.PRJC_CD);
    if (!prev || row.RPT_MNG_CD > prev.RPT_MNG_CD) {
      latestByProject.set(row.PRJC_CD, row);
    }
  }
  return Array.from(latestByProject.values()).map((row) => ({
    prjcCd: row.PRJC_CD,
    name: row.RGN_NM || row.PSTN_NM,
    region: row.LOGVM,
    stage: deriveStage(row.RPT_TYPE),
    projectType: row.SCLSF,
    address: `서울특별시 ${row.LOGVM} ${cleanPstnNm(row.PSTN_NM)}`.trim(),
    areaSqMeters: parseArea(row.AREA_CHG_AFTR) ?? parseArea(row.AREA_EXS),
  }));
}

/** 서울 열린데이터광장 upisRebuild를 수집해 재개발 구역으로 자동
 * 저장하는 관리자 도구. 좌표가 없는 데이터셋이라 위치명을 지오코딩해
 * 근사 경계를 만든다(설계: docs/redevelopment-zone-data-pipeline-design.md).
 * 사용자 요청, 2026-08-04: "서울 구역만 한번 해볼까?". */
export function RedevelopmentEditSeoulCollector({ onZonesSaved }: { onZonesSaved: () => void }) {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const groupsRef = useRef<ZoneGroup[] | null>(null);
  const cursorRef = useRef(0);
  const [gu, setGu] = useState("금천구");

  async function ensureGroupsLoaded() {
    if (groupsRef.current) return groupsRef.current;
    setMessage("서울시 정비사업 이력 전체를 가져오는 중...");
    const first = await fetchSeoulUpisPage(1, PAGE_SIZE);
    const allRows: SeoulUpisRow[] = [...first.rows];
    let start = PAGE_SIZE + 1;
    while (allRows.length < first.totalCount) {
      const page = await fetchSeoulUpisPage(start, start + PAGE_SIZE - 1);
      if (page.rows.length === 0) break;
      allRows.push(...page.rows);
      start += PAGE_SIZE;
    }
    const groups = groupLatestByProject(allRows);
    groupsRef.current = groups;
    return groups;
  }

  /** 선택한 구만 수집한다 — 위치명(PSTN_NM)에 그 구의 동 이름이 들어간 구역을
   * 후보로 골라 지오코딩하고, 좌표가 실제로 그 구 경계 안에 들어오는 것만 저장한다
   * (사용자 요청: "금천구랑 은평구 먼저"). 순차 배치(이어서 수집)와 달리 구 단위로
   * 한 번에 처리한다. */
  async function handleCollect() {
    setRunning(true);
    setMessage(null);
    try {
      const groups = await ensureGroupsLoaded();
      const [guData, dongData] = await Promise.all([
        fetch("/geo/seoul-gu.json").then((r) => r.json() as Promise<{ features: GeoFeature[] }>),
        fetch("/geo/seoul-dong.json").then((r) => r.json() as Promise<{ features: GeoFeature[] }>),
      ]);
      const guFeature = guData.features.find((f) => f.properties.name === gu);
      if (!guFeature) throw new Error(`${gu} 경계 데이터를 찾지 못했습니다.`);
      const dongNames = Array.from(
        new Set(dongData.features.filter((f) => f.properties.gu === gu).map((f) => baseDongName(f.properties.name))),
      );
      const candidates = groups.filter((g) => {
        const text = `${g.address} ${g.name}`;
        return text.includes(gu) || dongNames.some((d) => text.includes(d));
      });
      if (candidates.length === 0) {
        setMessage(`${gu}로 보이는 위치명을 가진 구역이 서울시 데이터에서 발견되지 않았습니다.`);
        return;
      }

      setProgress({ done: 0, total: candidates.length });
      const results: Array<{
        name: string;
        region: string;
        stage: string;
        projectType: string;
        polygon: { lat: number; lng: number }[];
        boundaryType: string;
        source: string;
        sourceDatasetId: string;
        sourceKey: string;
      }> = [];
      let outside = 0;

      for (let i = 0; i < candidates.length; i += GEOCODE_CONCURRENCY) {
        const chunk = candidates.slice(i, i + GEOCODE_CONCURRENCY);
        await Promise.all(
          chunk.map(async (group) => {
            const coord = await geocodeAddress(group.address);
            if (coord.latitude == null || coord.longitude == null) return;
            if (!pointInFeature(coord.latitude, coord.longitude, guFeature)) {
              outside += 1;
              return;
            }
            const { polygon, boundaryType } = buildApproxPolygon(
              [{ lat: coord.latitude, lng: coord.longitude }],
              group.areaSqMeters,
            );
            results.push({
              name: group.name,
              region: gu,
              stage: group.stage,
              projectType: group.projectType,
              polygon,
              boundaryType,
              source: SOURCE,
              sourceDatasetId: SOURCE_DATASET_ID,
              sourceKey: group.prjcCd,
            });
          }),
        );
        setProgress({ done: Math.min(i + GEOCODE_CONCURRENCY, candidates.length), total: candidates.length });
      }

      let saveSummary = "";
      if (results.length > 0) {
        const res = await bulkUpsertRedevelopmentZones(results);
        saveSummary = `저장 완료(생성 ${res.created} / 갱신 ${res.updated} / 수기보정 보호로 건너뜀 ${res.skippedManualOverride} / 실패 ${res.failed}).`;
      }
      setMessage(
        `${gu}: 후보 ${candidates.length}건 중 ${results.length}건 저장 대상(다른 구로 판명 ${outside}건, 좌표 실패 ${candidates.length - results.length - outside}건). ${saveSummary}`,
      );
      onZonesSaved();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "수집 중 오류가 발생했습니다.");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  return (
    <div className="rounded-sm border border-border bg-card p-4 space-y-2">
      <p className="text-sm font-semibold text-foreground">서울시 자동 수집 — 구 지정(수정용)</p>
      <p className="text-xs text-muted-foreground">
        서울 열린데이터광장 "서울시 도시계획 정비사업 현황"을 가져와 위치명을 지오코딩하고
        근사 구역(대부분 점 마커 원)으로 자동 저장합니다. 좌표 원본이 없는 데이터라 정확한
        경계가 아니라 대략적 위치입니다 — 정밀 경계가 필요하면 "경계 다시 그리기"로
        수기 보정하세요. 선택한 구에 속한 구역만 한 번에 처리합니다.
      </p>
      <div className="flex items-center gap-3">
        <select
          value={gu}
          onChange={(e) => setGu(e.target.value)}
          disabled={running}
          className="px-2 py-1 text-xs border border-border rounded-sm bg-background"
        >
          {["금천구", "은평구", "강남구", "강동구", "강북구", "강서구", "관악구", "광진구", "구로구", "노원구", "도봉구", "동대문구", "동작구", "마포구", "서대문구", "서초구", "성동구", "성북구", "송파구", "양천구", "영등포구", "용산구", "종로구", "중구", "중랑구"].map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void handleCollect()}
          disabled={running}
          className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
        >
          {running ? "수집 중..." : `${gu}만 수집`}
        </button>
        {progress && (
          <span className="text-xs text-muted-foreground">
            지오코딩 {progress.done}/{progress.total}건 처리 중...
          </span>
        )}
      </div>
      {message && <p className="text-xs text-foreground">{message}</p>}
    </div>
  );
}
