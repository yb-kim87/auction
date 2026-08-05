"use client";

import { useState } from "react";
import {
  bulkUpsertRedevelopmentZones,
  fetchEunpyeongDetail,
  fetchEunpyeongList,
  geocodeAddress,
  type EunpyeongDetail,
} from "@/lib/api";
import { buildApproxPolygon } from "@/lib/convex-hull";

const SOURCE = "NOTICE_PDF";
const SOURCE_DATASET_ID = "eunpyeong-ep-go-kr";
const CONCURRENCY = 3;

/** 추진현황 단계 중 값이 "-"가 아닌 마지막 단계를 현재 진행 단계로
 * 본다(설계 §7 사업단계) — 은평구청 표는 순서대로 기본계획고시 →
 * 정비구역지정고시 → 추진위원회승인 → 조합설립인가 → 사업시행인가 →
 * 관리처분인가 → 착공신고 → 준공일 → 이전고시로 진행되므로, 값이 채워진
 * 마지막 라벨이 곧 현재 단계다. */
function currentStage(detail: EunpyeongDetail): string {
  const done = detail.stages.filter((s) => s.value && s.value !== "-");
  if (done.length === 0) return "확인필요";
  return done[done.length - 1].label;
}

function stageHistoryText(detail: EunpyeongDetail): string {
  return detail.stages
    .filter((s) => s.value && s.value !== "-")
    .map((s) => `${s.label}: ${s.value}`)
    .join(" / ");
}

/** 은평구청 홈페이지(재개발/재건축 구역현황)를 수집해 재개발 구역으로
 * 자동 저장한다. 위치도 이미지 URL도 같이 저장해, 정밀 경계가 필요하면
 * "이미지로 구역 그리기" 도구에서 그 이미지를 바로 불러와 보정할 수
 * 있게 한다. 사용자 요청, 2026-08-04: "은평구 구청 한번 해보자". */
export function RedevelopmentEunpyeongCollector({ onZonesSaved }: { onZonesSaved: () => void }) {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function handleCollect() {
    setRunning(true);
    setMessage(null);
    try {
      setMessage("은평구청 구역 목록을 가져오는 중...");
      const list = await fetchEunpyeongList();
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
        referenceImageUrl: string | null;
        areaSqMeters: number | null;
      }> = [];
      let geocodeFailCount = 0;

      for (let i = 0; i < list.length; i += CONCURRENCY) {
        const chunk = list.slice(i, i + CONCURRENCY);
        await Promise.all(
          chunk.map(async (item) => {
            const detail = await fetchEunpyeongDetail(item.key);
            if (!detail.location) return;
            const address = `서울특별시 은평구 ${detail.location}`.trim();
            const coord = await geocodeAddress(address);
            if (coord.latitude == null || coord.longitude == null) {
              geocodeFailCount += 1;
              return;
            }
            const { polygon, boundaryType } = buildApproxPolygon(
              [{ lat: coord.latitude, lng: coord.longitude }],
              detail.areaSqMeters ?? undefined,
            );
            results.push({
              name: detail.title,
              region: "은평구",
              stage: currentStage(detail),
              projectType: item.category,
              polygon,
              boundaryType,
              source: SOURCE,
              sourceDatasetId: SOURCE_DATASET_ID,
              sourceKey: item.key,
              referenceImageUrl: detail.imageUrl,
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

      setMessage(
        `전체 ${list.length}개 구역 중 ${results.length}건 좌표 확보(${geocodeFailCount}건 지오코딩 실패). ${saveSummary}`,
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
      <p className="text-sm font-semibold text-foreground">은평구청 자동 수집(ep.go.kr)</p>
      <p className="text-xs text-muted-foreground">
        은평구청 홈페이지 "재개발/재건축 구역현황" 게시물을 가져와 구역명·사업단계(기본계획고시~준공까지
        추진 이력 포함)·면적을 자동 저장합니다. 좌표는 upisRebuild와 마찬가지로 위치명을
        지오코딩한 근사치입니다. 구역 수가 적어(약 26개) 한 번에 전부 처리됩니다.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleCollect()}
          disabled={running}
          className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
        >
          {running ? "수집 중..." : "은평구청 데이터 가져오기"}
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
