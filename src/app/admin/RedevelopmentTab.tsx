"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createRedevelopmentZone,
  deleteRedevelopmentZone,
  fetchRedevelopmentMapData,
  fetchRedevelopmentZoneAuctions,
  updateRedevelopmentZone,
  type RedevelopmentMapAuction,
  type RedevelopmentPoint,
  type RedevelopmentZone,
  type RedevelopmentZoneAuction,
} from "@/lib/api";
import { formatWon } from "@/lib/kakao-maps";
import { RedevelopmentMapView } from "./RedevelopmentMapView";
import { RedevelopmentImageTraceTool } from "./RedevelopmentImageTraceTool";
import { RedevelopmentSeoulCollector } from "./RedevelopmentSeoulCollector";
import { RedevelopmentEunpyeongCollector } from "./RedevelopmentEunpyeongCollector";
import { RedevelopmentAutoBoundaryCollector } from "./RedevelopmentAutoBoundaryCollector";

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

export function RedevelopmentTab() {
  const [zones, setZones] = useState<RedevelopmentZone[]>([]);
  const [auctions, setAuctions] = useState<RedevelopmentMapAuction[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [zoneAuctions, setZoneAuctions] = useState<RedevelopmentZoneAuction[]>([]);
  const [zoneAuctionsLoading, setZoneAuctionsLoading] = useState(false);

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

  const [infoEditId, setInfoEditId] = useState<string | null>(null);
  const [infoForm, setInfoForm] = useState<ZoneFormState>(EMPTY_FORM);

  const load = useCallback(() => {
    setLoading(true);
    setMessage(null);
    fetchRedevelopmentMapData()
      .then((res) => {
        setZones(res.zones);
        setAuctions(res.auctions);
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "불러오기 실패"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  function handleZoneClick(zoneId: string) {
    setSelectedZoneId((prev) => (prev === zoneId ? null : zoneId));
  }

  useEffect(() => {
    if (!selectedZoneId) {
      setZoneAuctions([]);
      return;
    }
    setZoneAuctionsLoading(true);
    fetchRedevelopmentZoneAuctions(selectedZoneId)
      .then(setZoneAuctions)
      .catch((err) => setMessage(err instanceof Error ? err.message : "구역 내 물건 조회 실패"))
      .finally(() => setZoneAuctionsLoading(false));
  }, [selectedZoneId]);

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
    setImageTracing(false);
    setImageTraceSourceUrl(null);
    setImageTraceCenter(null);
    setImageTraceArea(null);

    if (!editingZone) {
      setPendingPoints(points);
      return;
    }

    setSaving(true);
    try {
      await updateRedevelopmentZone(editingZone.id, {
        polygon: points,
        boundaryType: "MANUAL",
      });
      setPendingPoints(null);
      setEditingZone(null);
      setForm(EMPTY_FORM);
      setMessage(`"${editingZone.name}" 구역 경계를 저장했습니다.`);
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "구역 경계 저장 실패");
      setPendingPoints(points);
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

  function startInfoEdit(zone: RedevelopmentZone) {
    setSelectedZoneId(zone.id);
    setInfoEditId(zone.id);
    setInfoForm({ name: zone.name, region: zone.region, stage: zone.stage, memo: zone.memo ?? "" });
  }

  async function handleSaveInfo(zone: RedevelopmentZone) {
    const name = infoForm.name.trim();
    if (!name) {
      setMessage("구역명을 입력해주세요.");
      return;
    }
    try {
      await updateRedevelopmentZone(zone.id, {
        name,
        region: infoForm.region.trim(),
        stage: infoForm.stage.trim(),
        memo: infoForm.memo.trim(),
      });
      setInfoEditId(null);
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "구역 정보 수정 실패");
    }
  }

  async function handleDeleteZone(zone: RedevelopmentZone) {
    if (!confirm(`"${zone.name}" 구역을 삭제할까요?`)) return;
    try {
      await deleteRedevelopmentZone(zone.id);
      if (selectedZoneId === zone.id) setSelectedZoneId(null);
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "구역 삭제 실패");
    }
  }

  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null;

  return (
    <div className="p-6 space-y-6 max-w-[100rem]">
      <div>
        <h2 className="text-lg font-bold text-foreground">재개발물건</h2>
        <p className="text-sm text-muted-foreground mt-1">
          카카오맵 위에 재개발 구역 경계를 직접 그려 저장하고, 좌표가 확보된 경매물건이 그 구역
          안에 포함되는지 자동으로 판별합니다(매도분석 지도가 확보한 좌표를 그대로 재사용).
          구역을 클릭하면 그 구역 안에 포함된 물건 목록을 볼 수 있습니다.
        </p>
      </div>

      {message && (
        <div className="text-sm px-3 py-2 rounded-sm border border-border bg-secondary/30">
          {message}
        </div>
      )}

      <div className="flex items-center gap-3">
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
      </div>

      <RedevelopmentSeoulCollector onZonesSaved={load} />
      <RedevelopmentEunpyeongCollector onZonesSaved={load} />
      <RedevelopmentAutoBoundaryCollector zones={zones} onDone={load} />

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

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <RedevelopmentMapView
          zones={zones}
          auctions={auctions}
          selectedZoneId={selectedZoneId}
          onZoneClick={handleZoneClick}
          drawing={drawing}
          editingZone={editingZone}
          onFinishDraw={handleFinishDraw}
          draftPointCount={draftPointCount}
          onDraftPointCountChange={setDraftPointCount}
        />

        <div className="space-y-4">
          <div className="rounded-sm border border-border bg-card">
            <div className="px-3 py-2 border-b border-border text-sm font-semibold text-foreground">
              구역 목록 ({zones.length}개)
            </div>
            <ul className="divide-y divide-border max-h-[360px] overflow-y-auto">
              {zones.map((zone) => (
                <li key={zone.id} className="p-3 text-xs space-y-1.5">
                  {infoEditId === zone.id ? (
                    <div className="space-y-1.5">
                      <input
                        value={infoForm.name}
                        onChange={(e) => setInfoForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="구역명"
                        className="w-full px-2 py-1 border border-border rounded-sm bg-background"
                      />
                      <input
                        value={infoForm.region}
                        onChange={(e) => setInfoForm((f) => ({ ...f, region: e.target.value }))}
                        placeholder="지역명"
                        className="w-full px-2 py-1 border border-border rounded-sm bg-background"
                      />
                      <input
                        value={infoForm.stage}
                        onChange={(e) => setInfoForm((f) => ({ ...f, stage: e.target.value }))}
                        placeholder="사업단계"
                        list="redevelopment-stage-options"
                        className="w-full px-2 py-1 border border-border rounded-sm bg-background"
                      />
                      <input
                        value={infoForm.memo}
                        onChange={(e) => setInfoForm((f) => ({ ...f, memo: e.target.value }))}
                        placeholder="메모"
                        className="w-full px-2 py-1 border border-border rounded-sm bg-background"
                      />
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => void handleSaveInfo(zone)} className="text-primary hover:underline">
                          저장
                        </button>
                        <button type="button" onClick={() => setInfoEditId(null)} className="text-muted-foreground hover:underline">
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleZoneClick(zone.id)}
                        className={`block w-full text-left font-semibold ${
                          selectedZoneId === zone.id ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {zone.name}
                      </button>
                      <div className="text-muted-foreground">
                        {zone.region || "-"} {zone.stage && `· ${zone.stage}`}
                      </div>
                      {zone.memo && <div className="text-muted-foreground">{zone.memo}</div>}
                      <div className="flex items-center gap-2 pt-0.5">
                        <button type="button" onClick={() => startInfoEdit(zone)} className="text-primary hover:underline">
                          정보 수정
                        </button>
                        <button
                          type="button"
                          onClick={() => startImageRefine(zone)}
                          className="text-primary hover:underline"
                        >
                          구역 수정
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteZone(zone)}
                          className="text-destructive hover:underline"
                        >
                          삭제
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
              {zones.length === 0 && !loading && (
                <li className="p-3 text-xs text-muted-foreground">등록된 구역이 없습니다.</li>
              )}
            </ul>
          </div>

          {selectedZone && (
            <div className="rounded-sm border border-border bg-card">
              <div className="px-3 py-2 border-b border-border text-sm font-semibold text-foreground">
                "{selectedZone.name}" 구역 내 물건 ({zoneAuctions.length}건)
              </div>
              <ul className="divide-y divide-border max-h-[300px] overflow-y-auto">
                {zoneAuctionsLoading ? (
                  <li className="p-3 text-xs text-muted-foreground">불러오는 중...</li>
                ) : zoneAuctions.length === 0 ? (
                  <li className="p-3 text-xs text-muted-foreground">포함된 물건이 없습니다.</li>
                ) : (
                  zoneAuctions.map((a) => (
                    <li key={a.id} className="p-3 text-xs space-y-0.5">
                      <div className="font-semibold text-foreground">
                        {a.auctionNo} <span className="text-muted-foreground font-normal">{a.court}</span>
                      </div>
                      <div className="text-muted-foreground">{a.address}</div>
                      <div>낙찰가: {formatWon(a.salePrice)}</div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>
      </div>

      {imageTracing && (
        <RedevelopmentImageTraceTool
          // 구역이 바뀌면 통째로 새로 열리게 한다 — 도구가 내부 상태(이미지·
          // 추출 결과·기준점)를 들고 있어서, key 없이 props만 바꾸면 이전
          // 구역 화면이 그대로 남는다(사용자 리포트, 2026-08-06).
          key={editingZone?.id ?? "new"}
          existingPolygon={editingZone?.polygon ?? null}
          zoneName={editingZone?.name ?? null}
          onComplete={(points) => void handleFinishImageTrace(points)}
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
