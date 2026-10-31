"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchZoneResearch, fetchZoneRightDate, refreshZoneBlog, type RedevelopmentMapAuction, type RedevelopmentZone, type ZoneBlogInfo, type ZoneRightDate } from "@/lib/api";
import { loadZoneStats, zoneStatsOf, type ZoneDetails, type ZoneStats } from "@/lib/zone-stats";
import { zoneBusinessTypeLabel, zoneStyle } from "@/lib/zone-stage-style";
import { PROGRESS_STEPS, stageDisplayLabel, stagePosition } from "@/lib/zone-progress";
import { zoneStageCautions } from "@/lib/zone-stage-cautions";
import { RedevelopmentEditResearchPanel } from "./RedevelopmentEditResearchPanel";

const EOK = 100_000_000;
const won = (v: number | null | undefined) => (v ? (v >= EOK ? `${(Math.round(v / 1_000_000) / 100).toString()}억` : `${Math.round(v / 10_000).toLocaleString("ko-KR")}만`) : "-");

/** 만원 → "3.8억" / "9,500만" */
const man = (v: number | null | undefined) => (v == null ? "-" : v >= 10000 ? `${(Math.round(v / 100) / 100).toString()}억` : `${v.toLocaleString("ko-KR")}만`);
const pct = (v: number | null | undefined) => (v == null ? "-" : `${v}%`);

function ZoneProgress({ zone }: { zone: RedevelopmentZone }) {
  const stage = zone.stage;
  const current = stagePosition(stage);
  const { color, dashed, completed } = zoneStyle(zone);
  const cautions = zoneStageCautions(zoneBusinessTypeLabel(zone), stage);
  return (
    <section className="border-b border-border px-4 py-3 sm:px-5">
      {zone.missingSince && (
        <p className="mb-2 rounded-sm border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          <b className="text-foreground">사라진 구역</b> — 재개발닷컴 최신 수집({new Date(zone.missingSince).toLocaleDateString("ko-KR")})에서 이 구역이 보이지 않았습니다.
          사업이 무산·해제됐을 수 있습니다. 구역은 삭제하지 않고 회색 점선으로만 표시하며, 다시 나타나면 자동으로 해제됩니다.
        </p>
      )}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-bold text-foreground">사업 진행 단계</h3>
        <span className="text-sm font-bold" style={{ color, opacity: completed ? 0.65 : 1 }}>현재: {stageDisplayLabel(stage)}</span>
        {current != null && <span className="text-xs text-muted-foreground">{current + 1} / {PROGRESS_STEPS.length}단계</span>}
        <span className="text-xs text-muted-foreground">절차상 위치 참고 · 사업 방식에 따라 순서와 세부 단계가 다를 수 있습니다</span>
      </div>
      {current == null ? (
        <p className="mt-2 text-xs text-muted-foreground">현재 단계의 위치를 확인할 수 없습니다.</p>
      ) : (
        <ol className="mt-3 flex gap-1.5" aria-label={`사업 절차 참고 단계, 현재 ${stageDisplayLabel(stage)}`}>
          {PROGRESS_STEPS.map((step, index) => (
            <li key={step} aria-current={index === current ? "step" : undefined} title={step} className="h-2.5 min-w-0 flex-1 rounded-sm border" style={{
              borderColor: index <= current ? color : "#d1d5db",
              borderStyle: index <= current && dashed ? "dashed" : "solid",
              backgroundColor: index === current && !dashed && !completed ? color : index <= current && !completed ? `${color}25` : "transparent",
              opacity: completed && index <= current ? 0.4 : 1,
            }} />
          ))}
        </ol>
      )}
      {current != null && <div className="mt-1 flex justify-between text-[11px] text-muted-foreground"><span>추진 준비</span><span>준공</span></div>}
      {cautions.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <p className="font-bold">단계별 주의사항</p>
          <ul className="mt-1.5 space-y-2">
            {cautions.map((caution) => <li key={caution.id}>
              <span className="font-bold">{caution.title}</span>
              <p className="mt-0.5 leading-relaxed">{caution.description} {caution.sourceUrl && <a href={caution.sourceUrl} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline">관련 기준</a>}</p>
            </li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded border border-border bg-muted/40 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-bold text-foreground">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** 재개발 블로그(후니동산)에서 찾은 구역 주요정보(동의율·공문 타임라인·사업 관련 내용) — 구역 조사 때 함께 갱신된다. 글 작성일이 최신인 값을 대표로, 원문 링크를 단다.
 * 대상지 선정 단계 이후 구역은 동의율에 맞춰 이미 대상지가 정해졌으므로 동의율을 강조하지 않고(있으면 참고로만, 없으면 조용히 표시) 다른 정보를 먼저 보여 준다. */
function ZoneBlogSection({ blog, busy, onRefresh, error, afterSelection }: { blog: ZoneBlogInfo | undefined; busy: boolean; onRefresh: () => void; error?: string | null; afterSelection: boolean }) {
  const c = blog?.consent;
  const fmt = (n: { yesPct: number | null; noPct: number | null; qualifier: string | null }) =>
    [n.yesPct != null ? `찬성 ${n.yesPct}%${n.qualifier ?? ""}` : "", n.noPct != null ? `반대 ${n.noPct}%${n.qualifier ?? ""}` : ""].filter(Boolean).join(" · ");
  const consentBlock = c ? (
    afterSelection ? (
      <div className="mt-3 rounded border border-border px-3 py-2 text-xs">
        <p className="font-semibold text-foreground">
          동의율 <span className="font-normal text-muted-foreground">(참고 · 대상지 선정 이후 단계)</span>
        </p>
        <p className="mt-0.5 text-foreground">
          {fmt(c)} <span className="text-muted-foreground">· {c.postedAt} 글 기준</span>
        </p>
        <p className="mt-0.5 text-muted-foreground">{c.text}</p>
        <a href={c.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-blue-600 hover:underline">
          블로그 원문 열기 — {c.postTitle}
        </a>
        {(blog?.consentHistory ?? []).length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
            {(blog?.consentHistory ?? []).map((h) => (
              <li key={h.id}>
                이전 {h.postedAt}: {fmt(h)} ·{" "}
                <a href={h.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                  원문
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    ) : (
      <div className="mt-2 rounded border border-blue-300 bg-blue-50 px-3 py-2 text-xs">
        <span className="text-base font-bold text-blue-700">{fmt(c)}</span>
        <span className="ml-2 text-muted-foreground">{c.postedAt} 글 기준</span>
        <p className="mt-1 text-muted-foreground">{c.text}</p>
        <a href={c.url} target="_blank" rel="noreferrer" className="mt-1 inline-block font-semibold text-blue-600 hover:underline">
          블로그 원문 열기 — {c.postTitle}
        </a>
        {(blog?.consentHistory ?? []).length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
            {(blog?.consentHistory ?? []).map((h) => (
              <li key={h.id}>
                이전 {h.postedAt}: {fmt(h)} ·{" "}
                <a href={h.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                  원문
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  ) : blog?.fetchedAt ? (
    afterSelection ? (
      <p className="mt-3 text-xs text-muted-foreground">동의율: 확인된 데이터 없음 (대상지 선정 이후 단계라 참고 정보입니다)</p>
    ) : (
      <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2" role="status">
        <p className="text-sm font-bold text-amber-900">동의율 미확인</p>
        <p className="mt-0.5 text-xs text-amber-800">블로그 조사에서 이 구역의 동의율을 찾지 못했습니다.</p>
      </div>
    )
  ) : (
    <p className="mt-1 text-xs text-muted-foreground">{error ? "블로그 조사 결과를 확인하지 못했습니다." : "블로그 정보를 불러오는 중..."}</p>
  );
  return (
    <section className="border-b border-border px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-foreground">
          블로그 구역 주요정보 <span className="text-[11px] font-normal text-muted-foreground">(재개발 블로그 추정 · 공식 수치 아님)</span>
        </h3>
        <button type="button" disabled={busy} onClick={onRefresh} className="rounded-sm border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50">
          {busy ? "블로그 조사 중..." : "블로그 다시 조사"}
        </button>
        {blog?.fetchedAt && <span className="text-[11px] text-muted-foreground">조사 {new Date(blog.fetchedAt).toLocaleString("ko-KR")}</span>}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {!afterSelection && consentBlock}
      {blog && blog.timeline.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-foreground">자치구 공문 타임라인 (최신순)</p>
          <ul className="mt-1 divide-y divide-border rounded-sm border border-border text-xs">
            {blog.timeline.map((t) => (
              <li key={t.id} className="flex flex-wrap items-baseline gap-x-3 px-3 py-1.5">
                <span className="w-[84px] shrink-0 font-semibold text-foreground">{t.docDate}</span>
                <span className="min-w-0 flex-1 text-muted-foreground">{t.text}</span>
                <a href={t.url} target="_blank" rel="noreferrer" className="shrink-0 text-blue-600 hover:underline" title={t.postTitle}>
                  출처 {t.postedAt}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(blog?.insights?.length ?? 0) > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-foreground">사업 관련 내용 <span className="font-normal text-muted-foreground">· 글 작성일 기준 · 블로그 원문 발췌, 사실 확인 필요</span></p>
          <ul className="mt-1 divide-y divide-border rounded-sm border border-border text-xs">
            {blog!.insights!.map((item) => (
              <li key={item.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-1.5">
                <span className="w-[84px] shrink-0 font-semibold text-foreground" title="블로그 글 작성일">{item.postedAt}</span>
                <span className="min-w-0 flex-1 text-muted-foreground">{item.text}</span>
                <a href={item.url} target="_blank" rel="noreferrer" className="shrink-0 text-blue-600 hover:underline" title={item.postTitle}>원문</a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(blog?.articles?.length ?? 0) > 0 && (
        <div className="mt-3 text-xs"><p className="font-bold text-foreground">관련 블로그 글</p><ul className="mt-1 space-y-1">{blog!.articles!.map((item) => <li key={item.id}><a href={item.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{item.postTitle}</a> <span className="text-muted-foreground">· {item.postedAt}</span></li>)}</ul></div>
      )}
      {afterSelection && consentBlock}
      {blog?.diagnostics && <p className="mt-2 text-xs text-muted-foreground">검색 {blog.diagnostics.searched}건 · 확인 {blog.diagnostics.opened}/{blog.diagnostics.attempted}건 · 읽기 실패 {blog.diagnostics.failed}건 · 관련 글 {blog.articles?.length ?? 0}건 · 내용 {blog.insights?.length ?? 0}건</p>}
    </section>
  );
}

/** 재개발닷컴 구역 지표(저장해 둔 목록 데이터) — 세대수·소유자·노후도·용도지역·시세 요약. 동의율은 재개발닷컴에 없어 표시하지 않는다. */
function ZoneStatsSection({ stats }: { stats: ZoneStats }) {
  const od = stats.od ?? [];
  return (
    <section className="border-b border-border px-4 py-3 sm:px-5">
      <h3 className="text-sm font-bold text-foreground">
        구역 정보 <span className="text-[11px] font-normal text-muted-foreground">(재개발닷컴 데이터 기준 · 참고용)</span>
      </h3>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <Stat label="세대수" value={stats.s != null ? `${stats.s.toLocaleString("ko-KR")}세대` : "-"} />
        <Stat label="토지등소유자(추정)" value={stats.o != null ? `${stats.o.toLocaleString("ko-KR")}명` : "-"} />
        <Stat label="노후도(30년 기준)" value={pct(od[0])} sub={`5년 후 ${pct(od[1])} · 10년 후 ${pct(od[2])}`} />
        <Stat label="평균 전세가율" value={pct(stats.jr)} />
        <Stat label="평균 대지평당가" value={stats.lp != null ? `${stats.lp.toLocaleString("ko-KR")}만/평` : "-"} />
        <Stat label="네이버 호가" value={stats.ac != null ? `${stats.ac}건` : "-"} sub={stats.am != null ? `최저 ${man(stats.am)}${stats.ai != null ? ` · 초기투자금 ${man(stats.ai)}` : ""}` : undefined} />
        <Stat label="다세대 평균가" value={man(stats.mp)} />
        <Stat label="단독 평균가" value={man(stats.dp)} />
        <Stat label="토지 비율(혼합/단독/근린)" value={(stats.lr ?? []).map((v) => pct(v)).join(" / ") || "-"} />
        <Stat label="역세권(350m/500m)" value={(stats.st ?? []).map((v) => pct(v)).join(" / ") || "-"} />
        <Stat label="최근 진행 완료일" value={stats.d ?? "-"} sub={stats.ds} />
        {stats.th != null && <Stat label="계획 총세대 / 일반분양" value={`${stats.th.toLocaleString("ko-KR")} / ${stats.gs?.toLocaleString("ko-KR") ?? "-"}`} />}
      </div>
      {stats.zr && stats.zr.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">용도지역: {stats.zr.map(([n, v]) => `${n} ${v}%`).join(" · ")}</p>
      )}
      {stats.c && <p className="mt-1 text-xs text-muted-foreground">시공사: {Array.isArray(stats.c) ? stats.c.join(", ") : stats.c}</p>}
    </section>
  );
}

/** 권리산정기준일 — 목록 데이터에는 없고 재개발닷컴 상세 페이지에만 있다. 버튼을 누르면 서버가 그 구역 상세 페이지를 직접 받아 값을 읽고 저장한다. */
function ZoneRightDateSection({ zone, stats, onSaved }: { zone: RedevelopmentZone; stats: ZoneStats | null; onSaved: (zoneId: string, rd: ZoneRightDate) => void }) {
  const [saved, setSaved] = useState<ZoneRightDate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rb = saved ? saved.rb : stats?.rb;
  const rz = saved ? saved.rz : (stats?.rz ?? []);
  const rf = saved?.rf ?? stats?.rf;
  const checked = rf != null;
  const pg = saved?.pg ?? stats?.pg ?? [];
  const ps = saved ? saved.ps : stats?.ps;
  const gn = saved?.gn ?? stats?.gn ?? [];
  const dt = (saved?.dt ?? stats?.dt ?? {}) as ZoneDetails;
  const n = (v: number | undefined, unit: string) => (v != null ? `${v.toLocaleString("ko-KR")}${unit}` : null);
  const regulation = [dt.oh ? "투기과열지구" : null, dt.rt ? "조정대상지역" : null].filter(Boolean).join(" · ");
  const households = [n(dt.hh, "세대") && `총 ${n(dt.hh, "세대")}`, n(dt.hm, "세대") && `조합원 ${n(dt.hm, "세대")}`, n(dt.hg, "세대") && `일반 ${n(dt.hg, "세대")}`, n(dt.hr, "세대") && `임대 ${n(dt.hr, "세대")}`].filter(Boolean).join(" · ");
  const details: Array<[string, ReactNode]> = (
    [
      ["규제", regulation || null],
      ["토지거래허가", dt.lt ? `${dt.lt.st ?? ""} ${dt.lt.s ?? ""} ~ ${dt.lt.e ?? ""}`.trim() : null],
      ["전매 구분", dt.tr ?? null],
      ["추진위·조합 사무실", dt.on ?? null],
      ["사무실 주소", dt.oa ?? null],
      ["사무실 전화", dt.op ? <a href={`tel:${dt.op}`} className="text-primary hover:underline">{dt.op}</a> : null],
      ["시공사", dt.cs?.length ? dt.cs.join(", ") : null],
      ["신축 아파트명", dt.an ?? null],
      ["세대수", households || null],
      ["구역면적", n(dt.ar, "㎡")],
      ["토지등소유자", n(dt.ow, "명")],
      ["용적률 / 건폐율", dt.fa != null || dt.bc != null ? `${dt.fa ?? "-"}% / ${dt.bc ?? "-"}%` : null],
      ["최고층", n(dt.mx, "층")],
      ["평당 공사비", n(dt.cc, "만원")],
    ] as Array<[string, ReactNode]>
  ).filter(([, v]) => v != null && v !== "");

  function check() {
    setBusy(true);
    setError(null);
    fetchZoneRightDate(zone.id)
      .then((rd) => {
        setSaved(rd);
        onSaved(zone.id, rd);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "권리산정기준일을 확인하지 못했습니다."))
      .finally(() => setBusy(false));
  }

  const dot = (d: string) => d.replace(/^\d{2}(\d{2})-(\d{2})-(\d{2})$/, "$1.$2.$3");
  return (
    <section className="border-b border-border px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-foreground">
          권리산정일 · 세부내용 <span className="text-[11px] font-normal text-muted-foreground">(재개발닷컴 상세 페이지 기준)</span>
        </h3>
        <button
          type="button"
          disabled={busy}
          onClick={check}
          className="rounded-sm border border-border bg-background px-2 py-1 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
        >
          {busy ? "확인 중..." : checked ? "다시 확인" : "권리산정일 확인하기"}
        </button>
      </div>
      {checked ? (
        <p className="mt-1.5 text-sm text-foreground">
          <b>{rb ? dot(rb) : "정보 없음"}</b>
          {rz.length > 0 && <span className="text-muted-foreground"> (일부 {rz.map((z) => dot(z.d)).join(", ")})</span>}
          <span className="ml-2 text-[11px] text-muted-foreground">확인 {new Date(rf as string).toLocaleDateString("ko-KR")}</span>
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-muted-foreground">아직 확인하지 않았습니다.</p>
      )}
      {details.length > 0 && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          {details.map(([k, v]) => (
            <Fragment key={k}>
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-foreground">{v}</dd>
            </Fragment>
          ))}
        </dl>
      )}
      {pg.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-bold text-foreground">
            진행 현황
            {ps?.cur != null && (
              <span className="ml-2 font-normal text-muted-foreground">
                현재 단계 {ps.cur.toLocaleString("ko-KR")}일째{ps.med != null ? ` (같은 유형 구역 중앙값 ${ps.med.toLocaleString("ko-KR")}일)` : ""}
              </span>
            )}
          </p>
          <ol className="mt-1.5 flex flex-wrap gap-1.5">
            {pg.map((p) => (
              <li
                key={p.n}
                className={`rounded-sm border px-2 py-1 text-xs ${p.done ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-border bg-muted/40 text-muted-foreground"}`}
              >
                {p.done ? "✓ " : ""}
                {p.n}
                {p.d && <span className="ml-1 tabular-nums">{dot(p.d)}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
      {gn.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-bold text-foreground">최근 고시·공고</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {gn.map((g, i) => (
              <li key={`${g.s ?? i}`} className="text-foreground">
                <span className="mr-1.5 tabular-nums text-muted-foreground">{g.d ? dot(g.d) : "-"}</span>
                {g.s ? (
                  <a href={`https://jaegebal.com/gnotices/${g.s}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {g.t}
                  </a>
                ) : (
                  g.t
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </section>
  );
}

/** 지도에서 구역(라벨·다각형)을 눌렀을 때 — 구역 정보, 구역 안 경매물건, 그리고 경매물건 조사와 같은 레이아웃의 호가·실거래 조사 패널
 * (+ 구역 조사 시작 버튼)을 팝업으로 보여 준다. */
export function RedevelopmentEditSelectedZone({
  zone,
  auctions,
  toleranceM,
  onClose,
  onToggleInterest,
  onRightDateSaved,
  showNear,
  onSaveInfo,
  onDelete,
}: {
  zone: RedevelopmentZone;
  /** 이 구역 안(오차범위 포함)의 경매물건. */
  auctions: RedevelopmentMapAuction[];
  toleranceM: number;
  onAuctionClick: (auctionId: string) => void;
  onClose: () => void;
  /** 관심 구역 표시 켜기/끄기. */
  onToggleInterest: (zone: RedevelopmentZone) => void | Promise<void>;
  /** 지도의 "근처" 표시 여부 — 꺼져 있으면 조사 표도 경계 안 호가·실거래만 보여 준다. */
  showNear: boolean;
  /** 권리산정기준일을 확인·저장했을 때 — 부모의 구역 목록에도 반영한다. */
  onRightDateSaved: (zoneId: string, rd: ZoneRightDate) => void;
  /** 구역 정보(이름·지역·단계·메모) 저장 — 실패하면 throw. */
  onSaveInfo: (zone: RedevelopmentZone, form: { name: string; region: string; stage: string; memo: string }) => Promise<void>;
  onDelete: (zone: RedevelopmentZone) => Promise<void>;
}) {
  const style = zoneStyle(zone);
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState({ name: zone.name, region: zone.region, stage: zone.stage, memo: zone.memo ?? "" });
  const [infoBusy, setInfoBusy] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);
  async function saveInfo() {
    setInfoBusy(true);
    setInfoError(null);
    try {
      await onSaveInfo(zone, infoForm);
      setEditingInfo(false);
    } catch (e) {
      setInfoError(e instanceof Error ? e.message : "구역 정보 수정 실패");
    } finally {
      setInfoBusy(false);
    }
  }
  const [allStats, setAllStats] = useState<Record<string, ZoneStats> | null>(null);
  useEffect(() => {
    void loadZoneStats().then(setAllStats).catch(() => setAllStats(null));
  }, []);
  const stats = zoneStatsOf(allStats, zone);

  // 조사 결과(블로그 포함)는 아래 조사 패널과 같은 쿼리를 공유한다. 블로그를 한 번도 조사한 적 없으면 처음 열 때 자동으로 한 번 조사한다.
  const queryClient = useQueryClient();
  const researchKey = ["redev-research", `zone:${zone.id}`, toleranceM];
  const research = useQuery({ queryKey: researchKey, queryFn: () => fetchZoneResearch(zone.id, toleranceM) });
  const [blogBusy, setBlogBusy] = useState(false);
  const [blogError, setBlogError] = useState<string | null>(null);
  const autoTried = useRef(false);
  async function refreshBlog() {
    setBlogBusy(true);
    setBlogError(null);
    try {
      await refreshZoneBlog(zone.id);
      await queryClient.invalidateQueries({ queryKey: researchKey });
      await queryClient.invalidateQueries({ queryKey: ["redev-zone-consents"] });
    } catch (error) {
      setBlogError(error instanceof Error ? error.message : "블로그 조사에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setBlogBusy(false);
    }
  }
  useEffect(() => {
    if (research.data && !research.data.blog?.fetchedAt && !autoTried.current) {
      autoTried.current = true;
      void refreshBlog();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [research.data]);
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-0 sm:items-center sm:p-6" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />
      <div
        className="relative flex min-h-screen w-full max-w-[1320px] flex-col overflow-hidden rounded-none border-0 border-border bg-card shadow-2xl sm:h-[calc(100dvh-3rem)] sm:min-h-0 sm:rounded-xl sm:border"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-white px-4 sm:px-5">
          <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: style.color }} />
          <div className="min-w-0 flex-1">
            <span className="text-base font-bold text-foreground">{zone.name}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {zone.region}
              {zone.stage ? ` · ${zone.stage}` : ""}
              {zone.projectType ? ` · ${zone.projectType}` : ""}
              {` · 사업종류: ${zoneBusinessTypeLabel(zone).replace(/^사업종류 /, "")}`}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-xs font-semibold">
            <button
              type="button"
              onClick={() => void onToggleInterest(zone)}
              className={zone.isInterest ? "text-amber-600 hover:underline" : "text-muted-foreground hover:text-amber-600 hover:underline"}
            >
              {zone.isInterest ? "★ 관심" : "☆ 관심"}
            </button>
            <button type="button" onClick={() => setEditingInfo((v) => !v)} className="text-primary hover:underline">
              정보 수정
            </button>
            <button type="button" onClick={() => void onDelete(zone)} className="text-destructive hover:underline">
              삭제
            </button>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-sm text-muted-foreground hover:text-foreground">
            닫기 ✕
          </button>
        </div>

        {editingInfo && (
          <div className="shrink-0 space-y-2 border-b border-border bg-muted/30 px-4 py-3 text-xs sm:px-5">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              {([
                ["name", "구역명"],
                ["region", "지역명"],
                ["stage", "사업단계"],
                ["memo", "메모"],
              ] as const).map(([key, label]) => (
                <input
                  key={key}
                  value={infoForm[key]}
                  onChange={(e) => setInfoForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={label}
                  className="w-full rounded-sm border border-border bg-background px-2 py-1.5"
                />
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button type="button" disabled={infoBusy} onClick={() => void saveInfo()} className="font-semibold text-primary hover:underline disabled:opacity-50">
                {infoBusy ? "저장 중..." : "저장"}
              </button>
              <button type="button" onClick={() => setEditingInfo(false)} className="text-muted-foreground hover:underline">
                취소
              </button>
              {infoError && <span className="text-destructive">{infoError}</span>}
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <ZoneProgress zone={zone} />
          {stats && <ZoneStatsSection stats={stats} />}
          {/^jaegebal-\d+/.test(zone.sourceKey ?? "") && <ZoneRightDateSection zone={zone} stats={stats} onSaved={onRightDateSaved} />}
          <ZoneBlogSection blog={research.data?.blog} busy={blogBusy} error={blogError} onRefresh={() => void refreshBlog()} afterSelection={(stagePosition(zone.stage) ?? -1) >= 1} />
          <RedevelopmentEditResearchPanel zoneId={zone.id} zoneAuctions={auctions} toleranceM={toleranceM} rightDate={stats?.rb} showNear={showNear} />
        </div>
      </div>
    </div>
  );
}
