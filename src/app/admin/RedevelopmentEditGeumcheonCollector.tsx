"use client";

import { useState } from "react";
import {
  bulkUpsertRedevelopmentZones,
  fetchGeumcheonDetail,
  fetchGeumcheonList,
  geocodeAddress,
} from "@/lib/api";
import { buildApproxPolygon } from "@/lib/convex-hull";

const SOURCE = "NOTICE_PDF";
const SOURCE_DATASET_ID = "geumcheon-go-kr";
const CONCURRENCY = 3;

/** "시흥4동 1-1번지 일대" → "시흥동 1-1" — 구청 위치는 행정동(번호 포함)이라
 * 지오코딩이 잘 되는 법정동 지번 형태로 바꾼다. */
function toGeocodeAddress(location: string): string {
  return `서울특별시 금천구 ${location}`
    .replace(/([가-힣]+)\d+동/, "$1동")
    .replace(/번지|일대|일원/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 금천구청 홈페이지 "정비사업 현황"(정비사업 목록/상세)을 수집해 구역으로 저장한다.
 * 사업명·구분·진행상태·면적·추진 이력을 가져오고, 위치는 지오코딩한 근사 경계다
 * (구청 페이지에 경계 좌표/구역도 이미지는 없다). 수정용 탭 전용 도구 —
 * 사용자 요청: "금천구청 수집기 만들어줘". */
export function RedevelopmentEditGeumcheonCollector({ onZonesSaved }: { onZonesSaved: () => void }) {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function handleCollect() {
    setRunning(true);
    setMessage(null);
    try {
      setMessage("금천구청 정비사업 목록을 가져오는 중...");
      const list = await fetchGeumcheonList();
      setProgress({ done: 0, total: list.length });

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
        areaSqMeters: number | null;
      }> = [];
      let geocodeFailCount = 0;

      for (let i = 0; i < list.length; i += CONCURRENCY) {
        const chunk = list.slice(i, i + CONCURRENCY);
        await Promise.all(
          chunk.map(async (item) => {
            const detail = await fetchGeumcheonDetail(item.id);
            const location = detail.location || item.location;
            if (!location) {
              geocodeFailCount += 1;
              return;
            }
            const coord = await geocodeAddress(toGeocodeAddress(location));
            if (coord.latitude == null || coord.longitude == null) {
              geocodeFailCount += 1;
              return;
            }
            const { polygon, boundaryType } = buildApproxPolygon(
              [{ lat: coord.latitude, lng: coord.longitude }],
              detail.areaSqMeters ?? undefined,
            );
            results.push({
              name: item.title || detail.title,
              region: "금천구",
              stage: detail.status || item.status || "확인필요",
              projectType: detail.category || item.category,
              polygon,
              boundaryType,
              source: SOURCE,
              sourceDatasetId: SOURCE_DATASET_ID,
              sourceKey: `geumcheon-${item.id}`,
              areaSqMeters: detail.areaSqMeters,
            });
          }),
        );
        setProgress({ done: Math.min(i + CONCURRENCY, list.length), total: list.length });
      }

      let saveSummary = "";
      if (results.length > 0) {
        const res = await bulkUpsertRedevelopmentZones(results);
        saveSummary = `저장 완료(생성 ${res.created} / 갱신 ${res.updated} / 수기보정 보호로 건너뜀 ${res.skippedManualOverride} / 실패 ${res.failed}).`;
      }
      setMessage(`전체 ${list.length}건 중 ${results.length}건 저장 대상(지오코딩 실패 ${geocodeFailCount}건). ${saveSummary}`);
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
      <p className="text-sm font-semibold text-foreground">금천구청 자동 수집(geumcheon.go.kr)</p>
      <p className="text-xs text-muted-foreground">
        금천구청 "정비사업 현황"의 사업명·사업구분·진행상태·구역면적을 자동 저장합니다.
        위치는 지오코딩한 근사 경계이며 구청 페이지에는 구역도/경계 데이터가 없습니다.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleCollect()}
          disabled={running}
          className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
        >
          {running ? "수집 중..." : "금천구청 데이터 가져오기"}
        </button>
        {progress && (
          <span className="text-xs text-muted-foreground">
            처리 중 {progress.done}/{progress.total}건...
          </span>
        )}
      </div>
      {message && <p className="text-xs text-foreground">{message}</p>}
    </div>
  );
}
