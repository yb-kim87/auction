"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchRealtorSidoList,
  fetchRealtorSubOptions,
  fetchRealtorCollectStatus,
  startRealtorCollect,
  fetchRealtorOffices,
  realtorExportExcelUrl,
  type RealtorRegionOption,
  type RealtorCollectStatus,
  type RealtorOffice,
} from "@/lib/api";

const ALL_OPTION: RealtorRegionOption = { code: "", name: "전체" };
const PAGE_SIZE = 50;

/** 지역 3단 드롭박스(시/도 → 시/군/구 → 읍/면/동) 훅. 수집 실행용과
 * DB 조회 필터용 두 군데서 동일한 로직을 쓴다(사용자 요청, 2026-08-10:
 * 기존 hanbang.py 데스크톱 수집기의 3단 드롭박스를 그대로 재현). */
function useRegionCascade() {
  const [sidoList, setSidoList] = useState<RealtorRegionOption[]>([]);
  const [gugunList, setGugunList] = useState<RealtorRegionOption[]>([ALL_OPTION]);
  const [dongList, setDongList] = useState<RealtorRegionOption[]>([ALL_OPTION]);
  const [sidoCode, setSidoCode] = useState("");
  const [gugunCode, setGugunCode] = useState("");
  const [dongCode, setDongCode] = useState("");

  useEffect(() => {
    fetchRealtorSidoList()
      .then((list) => {
        setSidoList(list);
        if (list.length > 0) setSidoCode(list[0].code);
      })
      .catch(() => setSidoList([]));
  }, []);

  useEffect(() => {
    if (!sidoCode) {
      setGugunList([ALL_OPTION]);
      setGugunCode("");
      return;
    }
    let cancelled = false;
    fetchRealtorSubOptions("S", sidoCode)
      .then((list) => {
        if (cancelled) return;
        setGugunList([ALL_OPTION, ...list]);
        setGugunCode("");
      })
      .catch(() => {
        if (!cancelled) setGugunList([ALL_OPTION]);
      });
    return () => {
      cancelled = true;
    };
  }, [sidoCode]);

  useEffect(() => {
    if (!sidoCode || !gugunCode) {
      setDongList([ALL_OPTION]);
      setDongCode("");
      return;
    }
    let cancelled = false;
    fetchRealtorSubOptions("G", sidoCode, gugunCode)
      .then((list) => {
        if (cancelled) return;
        setDongList([ALL_OPTION, ...list]);
        setDongCode("");
      })
      .catch(() => {
        if (!cancelled) setDongList([ALL_OPTION]);
      });
    return () => {
      cancelled = true;
    };
  }, [sidoCode, gugunCode]);

  const sidoName = sidoList.find((o) => o.code === sidoCode)?.name ?? "";
  const gugunName = gugunList.find((o) => o.code === gugunCode)?.name ?? "";
  const dongName = dongList.find((o) => o.code === dongCode)?.name ?? "";

  return {
    sidoList, gugunList, dongList,
    sidoCode, gugunCode, dongCode,
    sidoName, gugunName, dongName,
    setSidoCode, setGugunCode, setDongCode,
  };
}

const SELECT_CLS =
  "h-9 px-2 border border-border rounded-sm bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20";

export function RealtorCollectTab() {
  const collect = useRegionCascade();
  const browse = useRegionCascade();
  const [search, setSearch] = useState("");

  const [status, setStatus] = useState<RealtorCollectStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const [offices, setOffices] = useState<RealtorOffice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingList, setLoadingList] = useState(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(() => {
    fetchRealtorCollectStatus()
      .then((s) => {
        setStatus(s);
        if (!s.running) stopPolling();
      })
      .catch(() => {});
  }, [stopPolling]);

  useEffect(() => {
    // 다른 관리자가 이미 수집을 돌리고 있을 수도 있으니 탭을 열면 한 번
    // 상태를 확인하고, 실행 중이면 바로 폴링을 시작한다.
    fetchRealtorCollectStatus()
      .then((s) => {
        setStatus(s);
        if (s.running) {
          pollRef.current = setInterval(pollStatus, 2000);
        }
      })
      .catch(() => {});
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status?.logs) {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [status?.logs]);

  async function handleStart() {
    if (!collect.sidoCode) return;
    setError("");
    setStarting(true);
    try {
      await startRealtorCollect({
        sidoCode: collect.sidoCode,
        gugunCode: collect.gugunCode,
        dongCode: collect.dongCode,
        sidoName: collect.sidoName,
        gugunName: collect.gugunName,
        dongName: collect.dongName,
      });
      pollRef.current = setInterval(pollStatus, 1500);
      pollStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "수집 시작에 실패했습니다.");
    } finally {
      setStarting(false);
    }
  }

  const loadOffices = useCallback(
    (targetPage: number) => {
      setLoadingList(true);
      fetchRealtorOffices({
        sidoCode: browse.sidoCode || undefined,
        gugunCode: browse.gugunCode || undefined,
        dongCode: browse.dongCode || undefined,
        search: search.trim() || undefined,
        page: targetPage,
        pageSize: PAGE_SIZE,
      })
        .then((res) => {
          setOffices(res.items);
          setTotal(res.total);
          setPage(res.page);
        })
        .catch(() => {
          setOffices([]);
          setTotal(0);
        })
        .finally(() => setLoadingList(false));
    },
    [browse.sidoCode, browse.gugunCode, browse.dongCode, search],
  );

  useEffect(() => {
    loadOffices(1);
  }, [loadOffices]);

  // 수집이 막 끝나면 방금 저장된 결과가 바로 보이도록 목록을 새로고침.
  useEffect(() => {
    if (status && !status.running && status.finishedAt) {
      loadOffices(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.finishedAt]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="rounded-sm border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-base font-bold text-foreground">부동산수집 (한방 중개업소)</h2>
          <p className="text-xs text-muted-foreground mt-1">
            한방(karhanbang.com)에서 지역별 부동산 중개업소 상호·담당자·휴대폰 번호를 수집합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">시/도</label>
            <select
              value={collect.sidoCode}
              onChange={(e) => collect.setSidoCode(e.target.value)}
              className={SELECT_CLS}
            >
              {collect.sidoList.map((o) => (
                <option key={o.code} value={o.code}>{o.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">시/군/구</label>
            <select
              value={collect.gugunCode}
              onChange={(e) => collect.setGugunCode(e.target.value)}
              className={SELECT_CLS}
            >
              {collect.gugunList.map((o) => (
                <option key={o.code || "all"} value={o.code}>{o.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">읍/면/동</label>
            <select
              value={collect.dongCode}
              onChange={(e) => collect.setDongCode(e.target.value)}
              className={SELECT_CLS}
            >
              {collect.dongList.map((o) => (
                <option key={o.code || "all"} value={o.code}>{o.name}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void handleStart()}
            disabled={starting || status?.running || !collect.sidoCode}
            className="h-9 px-4 text-sm font-semibold bg-primary text-primary-foreground rounded-sm hover:bg-accent transition-colors disabled:opacity-50"
          >
            {status?.running ? "수집 중..." : "실행"}
          </button>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        {status && (status.running || status.logs.length > 0) && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {status.sidoName} {status.gugunName} {status.dongName}
                {status.total > 0 && ` · 진행 ${status.done}/${status.total} (저장 ${status.saved}건)`}
              </span>
              {status.running && <span className="text-primary font-semibold">진행 중...</span>}
              {!status.running && status.finishedAt && !status.error && (
                <span className="text-emerald-600 font-semibold">완료</span>
              )}
              {status.error && <span className="text-destructive font-semibold">오류</span>}
            </div>
            <div className="h-48 overflow-y-auto rounded-sm border border-border bg-secondary/20 px-3 py-2 text-[11px] font-mono text-foreground/80 space-y-0.5">
              {status.logs.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}
      </div>

      <div className="rounded-sm border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">수집된 중개업소 ({total.toLocaleString()}건)</h3>
          <a
            href={realtorExportExcelUrl({
              sidoCode: browse.sidoCode || undefined,
              gugunCode: browse.gugunCode || undefined,
              dongCode: browse.dongCode || undefined,
              search: search.trim() || undefined,
            })}
            className="h-9 px-4 inline-flex items-center text-sm font-semibold border border-border rounded-sm hover:bg-secondary transition-colors"
          >
            엑셀로 저장
          </a>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">시/도</label>
            <select
              value={browse.sidoCode}
              onChange={(e) => browse.setSidoCode(e.target.value)}
              className={SELECT_CLS}
            >
              <option value="">전체</option>
              {browse.sidoList.map((o) => (
                <option key={o.code} value={o.code}>{o.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">시/군/구</label>
            <select
              value={browse.gugunCode}
              onChange={(e) => browse.setGugunCode(e.target.value)}
              className={SELECT_CLS}
              disabled={!browse.sidoCode}
            >
              {browse.gugunList.map((o) => (
                <option key={o.code || "all"} value={o.code}>{o.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">읍/면/동</label>
            <select
              value={browse.dongCode}
              onChange={(e) => browse.setDongCode(e.target.value)}
              className={SELECT_CLS}
              disabled={!browse.gugunCode}
            >
              {browse.dongList.map((o) => (
                <option key={o.code || "all"} value={o.code}>{o.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1 flex-1 min-w-[160px]">
            <label className="text-xs text-muted-foreground">검색(상호/담당자/번호/주소)</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="검색어 입력"
              className="w-full h-9 px-2 border border-border rounded-sm bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2 px-2">상호</th>
                <th className="text-left py-2 px-2">담당자</th>
                <th className="text-left py-2 px-2">모바일</th>
                <th className="text-left py-2 px-2">전화</th>
                <th className="text-left py-2 px-2">주소</th>
                <th className="text-left py-2 px-2">수집일</th>
              </tr>
            </thead>
            <tbody>
              {loadingList ? (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">불러오는 중...</td></tr>
              ) : offices.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">수집된 데이터가 없습니다.</td></tr>
              ) : (
                offices.map((o) => (
                  <tr key={o.id} className="border-b border-border/60 hover:bg-secondary/20">
                    <td className="py-1.5 px-2 font-medium text-foreground">{o.name}</td>
                    <td className="py-1.5 px-2">{o.managerName}</td>
                    <td className="py-1.5 px-2 font-mono">{o.mobilePrimary}</td>
                    <td className="py-1.5 px-2 font-mono">{o.landline}</td>
                    <td className="py-1.5 px-2 text-muted-foreground">{o.address}</td>
                    <td className="py-1.5 px-2 text-muted-foreground">{o.updatedAt.slice(0, 10)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => loadOffices(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 border border-border rounded-sm hover:bg-secondary disabled:opacity-40"
            >
              이전
            </button>
            <span className="text-muted-foreground">{page} / {totalPages}</span>
            <button
              type="button"
              onClick={() => loadOffices(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 border border-border rounded-sm hover:bg-secondary disabled:opacity-40"
            >
              다음
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
