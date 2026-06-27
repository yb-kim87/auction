"use client";

import { useEffect, useMemo, useState } from "react";
import { X, ExternalLink, MapPin, Calendar, Building2, History, Save, Trash2, Heart } from "lucide-react";
import type { AuctionItem, UpdateAuctionPayload } from "@/types/auction";
import {
  AUCTION_FIELD_GROUPS,
  toFormState,
  toPayload,
} from "@/lib/auction-form";
import { AuctionFieldInput } from "@/components/AuctionFieldInput";
import { deleteAuction, updateAuction } from "@/lib/api";
import { UpdatedBadge } from "@/components/UpdatedBadge";

const LIST_TEXT = "text-[15px] leading-snug";
const LABEL_TEXT = "text-[14px] leading-snug";
const SECTION_TEXT = "text-[16px] leading-snug";

const fmt = (n: number) => n.toLocaleString("ko-KR");
const fmtEok = (n: number) => {
  if (n >= 100000000) return `${(n / 100000000).toFixed(2)}억`;
  if (n >= 10000) return `${(n / 10000).toFixed(0)}만`;
  return fmt(n);
};

const diff = (a: number, b: number) => {
  const d = a - b;
  const sign = d >= 0 ? "+" : "";
  return { val: `${sign}${fmtEok(d)}`, positive: d >= 0 };
};

function parsePreviewNumber(value: string | number | null | undefined): number {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function formatFieldValue(
  key: keyof UpdateAuctionPayload,
  item: AuctionItem,
): string {
  const value = item[key as keyof AuctionItem];
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") {
    if (
      key === "views" ||
      key === "totalUnits" ||
      key === "builtYear" ||
      key === "tradingCount"
    ) {
      return fmt(value);
    }
    return fmtEok(value);
  }
  return String(value);
}

function PriceCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "orange" | "green" | "primary";
}) {
  const accentClass =
    accent === "orange"
      ? "text-orange-600"
      : accent === "green"
        ? "text-emerald-600"
        : "text-foreground";

  return (
    <div className="bg-secondary/40 border border-border rounded-sm px-4 py-3">
      <p className={`${LABEL_TEXT} text-muted-foreground mb-1`}>{label}</p>
      <p className={`${SECTION_TEXT} font-bold font-mono ${accentClass}`}>{value}</p>
    </div>
  );
}

function DiffBadge({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 bg-card border border-border rounded-sm">
      <span className={`${LABEL_TEXT} text-muted-foreground`}>{label}</span>
      <span className={`${LIST_TEXT} font-mono font-semibold ${positive ? "text-emerald-600" : "text-red-500"}`}>
        {value}
      </span>
    </div>
  );
}

export function AuctionDetailModal({
  item,
  onClose,
  onViewHistory,
  editable = false,
  onSaved,
  onDeleted,
  isFavorite = false,
  favoriteBusy = false,
  onToggleFavorite,
}: {
  item: AuctionItem | null;
  onClose: () => void;
  onViewHistory?: (item: AuctionItem) => void;
  editable?: boolean;
  onSaved?: (item: AuctionItem) => void;
  onDeleted?: (id: string) => void;
  isFavorite?: boolean;
  favoriteBusy?: boolean;
  onToggleFavorite?: (next: boolean) => Promise<void>;
}) {
  const [form, setForm] = useState<UpdateAuctionPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!item) return;
    setForm(toFormState(item));
    setError("");
  }, [item]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [item, onClose]);

  const preview = useMemo(() => {
    if (!item || !form) return null;
    return { ...item, ...toPayload(form) };
  }, [item, form]);

  if (!item || !form || !preview) return null;

  const naverPrice = parsePreviewNumber(form.naverPrice);
  const minPrice = parsePreviewNumber(form.minPrice);
  const appraisedValue = parsePreviewNumber(form.appraisedValue);
  const salePriceRaw = form.salePrice;
  const salePrice =
    salePriceRaw == null || String(salePriceRaw).trim() === ""
      ? null
      : parsePreviewNumber(salePriceRaw);

  const d1 = salePrice != null ? diff(naverPrice, salePrice) : null;
  const d2 = diff(naverPrice, minPrice);
  const d3 = diff(naverPrice, appraisedValue);

  const setField = (key: keyof UpdateAuctionPayload, value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const saved = await updateAuction(item.id, toPayload(form));
      setForm(toFormState(saved));
      onSaved?.(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const label = item.auctionNo || item.address || "이 물건";
    if (!window.confirm(`${label}을(를) 삭제할까요?`)) return;

    setDeleting(true);
    setError("");
    try {
      await deleteAuction(item.id);
      onDeleted?.(item.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!onToggleFavorite) return;
    setFavoriteSaving(true);
    setError("");
    try {
      await onToggleFavorite(!isFavorite);
    } catch (err) {
      setError(err instanceof Error ? err.message : "관심물건 처리에 실패했습니다.");
    } finally {
      setFavoriteSaving(false);
    }
  };

  const favoriteDisabled = favoriteBusy || favoriteSaving;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center p-4 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />

      <div
        className="relative w-full max-w-4xl my-4 bg-card border border-border rounded-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: "'Noto Sans KR', sans-serif" }}
      >
        <div className="sticky top-0 z-10 bg-primary text-primary-foreground px-5 py-4 rounded-t-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className={`${LABEL_TEXT} bg-white/15 px-2 py-0.5 rounded-sm`}>
                  {preview.propType}
                </span>
                {preview.memo && (
                  <span className={`${LABEL_TEXT} bg-amber-500/30 text-amber-100 px-2 py-0.5 rounded-sm`}>
                    {preview.memo}
                  </span>
                )}
                {editable && (
                  <span className={`${LABEL_TEXT} bg-white/20 px-2 py-0.5 rounded-sm`}>
                    수정 가능
                  </span>
                )}
              </div>
              <p className={`font-mono font-bold ${SECTION_TEXT} inline-flex items-center gap-2 flex-wrap`}>
                {preview.auctionNo || "경매번호 없음"}
                {preview.isUpdated && <UpdatedBadge className="bg-white/20 text-white border-white/30" />}
              </p>
              {preview.isUpdated && preview.updatedAt && (
                <p className={`mt-1 ${LABEL_TEXT} text-white/70`}>
                  최근 갱신 {new Date(preview.updatedAt).toLocaleString("ko-KR")}
                  {preview.updatedBy ? ` · ${preview.updatedBy}` : ""}
                </p>
              )}
              <p className={`mt-2 ${LIST_TEXT} text-white/90 leading-relaxed flex items-start gap-2`}>
                <MapPin size={16} className="shrink-0 mt-0.5 opacity-80" />
                <span>{preview.address || "-"}</span>
              </p>
              <div className={`mt-2 flex flex-wrap gap-x-4 gap-y-1 ${LABEL_TEXT} text-white/70`}>
                <span className="inline-flex items-center gap-1">
                  <Building2 size={14} />
                  {preview.city} {preview.district}
                </span>
                <span>{preview.area} · {preview.usage}</span>
                <span>{preview.builtYear ? `${preview.builtYear}년` : "-"}</span>
                <span className="inline-flex items-center gap-1">
                  <Calendar size={14} />
                  입찰 {preview.bidDate || "-"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onToggleFavorite && (
                <button
                  type="button"
                  onClick={handleToggleFavorite}
                  disabled={favoriteDisabled}
                  className={`flex items-center gap-1.5 px-3 py-1.5 ${LABEL_TEXT} border rounded-sm transition-colors disabled:opacity-50 ${
                    isFavorite
                      ? "bg-rose-500/25 border-rose-200/40 text-white hover:bg-rose-500/35"
                      : "bg-white/10 border-white/25 hover:bg-white/20"
                  }`}
                >
                  <Heart
                    size={14}
                    className={isFavorite ? "fill-current text-rose-200" : ""}
                  />
                  {isFavorite ? "관심물건 해제" : "관심물건 추가"}
                </button>
              )}
              {onViewHistory && (
                <button
                  type="button"
                  onClick={() => onViewHistory(item)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 ${LABEL_TEXT} bg-white/10 border border-white/25 rounded-sm hover:bg-white/20 transition-colors`}
                >
                  <History size={14} />
                  변경 이력
                </button>
              )}
              {preview.link && (
                <a
                  href={preview.link}
                  target="_blank"
                  rel="noreferrer"
                  className={`flex items-center gap-1.5 px-3 py-1.5 ${LABEL_TEXT} bg-white/10 border border-white/25 rounded-sm hover:bg-white/20 transition-colors`}
                >
                  <ExternalLink size={14} />
                  경매지정보
                </a>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-sm hover:bg-white/15 transition-colors"
                aria-label="닫기"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 py-5 space-y-6 max-h-[calc(100vh-12rem)] overflow-y-auto">
          <section>
            <h3 className={`${SECTION_TEXT} font-semibold text-foreground mb-3`}>가격 요약</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <PriceCard label="감정가" value={appraisedValue ? fmtEok(appraisedValue) : "-"} />
              <PriceCard label="최저가" value={minPrice ? fmtEok(minPrice) : "-"} accent="orange" />
              <PriceCard
                label="매각가"
                value={salePrice ? fmtEok(salePrice) : "-"}
                accent="green"
              />
              <PriceCard label="네이버 호가" value={naverPrice ? fmtEok(naverPrice) : "-"} accent="primary" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <DiffBadge label="호가 - 매각가" value={d1?.val ?? "-"} positive={d1?.positive ?? true} />
              <DiffBadge label="호가 - 최저가" value={d2.val} positive={d2.positive} />
              <DiffBadge label="호가 - 감정가" value={d3.val} positive={d3.positive} />
            </div>
          </section>

          {editable ? (
            <>
              {AUCTION_FIELD_GROUPS.map((group) => (
                <section key={group.title}>
                  <h3 className={`${SECTION_TEXT} font-semibold text-foreground mb-3 pb-2 border-b border-border`}>
                    {group.title}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                    {group.fields.map((field) => (
                      <div key={field.key} className={field.full ? "sm:col-span-2" : ""}>
                        <label className={`block ${LABEL_TEXT} text-muted-foreground mb-1.5`}>
                          {field.label}
                        </label>
                        <AuctionFieldInput
                          field={field}
                          value={form[field.key] as string | number | null}
                          onChange={(v) => setField(field.key, v)}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ))}

              {error && (
                <p className={`${LIST_TEXT} text-destructive border border-destructive/30 bg-destructive/5 rounded-sm px-3 py-2`}>
                  {error}
                </p>
              )}
            </>
          ) : (
            AUCTION_FIELD_GROUPS.map((group) => {
              const skipKeys = new Set([
                "auctionNo",
                "address",
                "link",
                "appraisedValue",
                "minPrice",
                "salePrice",
                "naverPrice",
              ]);
              const fields = group.fields.filter((f) => !skipKeys.has(f.key));
              if (fields.length === 0) return null;

              return (
                <section key={group.title}>
                  <h3 className={`${SECTION_TEXT} font-semibold text-foreground mb-3 pb-2 border-b border-border`}>
                    {group.title}
                  </h3>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                    {fields.map((field) => {
                      const value = formatFieldValue(field.key, item);
                      const isFull = field.full;

                      return (
                        <div key={field.key} className={isFull ? "sm:col-span-2" : ""}>
                          <dt className={`${LABEL_TEXT} text-muted-foreground mb-0.5`}>{field.label}</dt>
                          <dd className={`${LIST_TEXT} text-foreground break-words`}>
                            {field.key === "specialNote" && value !== "-" ? (
                              <span className="text-red-600 font-medium">{value}</span>
                            ) : field.key === "buildingRegistry" ? (
                              <span className={value !== "이상없음" ? "text-red-500 font-semibold" : "text-emerald-600"}>
                                {value}
                              </span>
                            ) : (
                              value
                            )}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </section>
              );
            })
          )}
        </div>

        <div className="px-5 py-3 border-t border-border bg-secondary/20 flex items-center justify-between gap-2">
          {editable ? (
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={saving || deleting}
              className={`flex items-center gap-1.5 px-4 py-2 ${LIST_TEXT} font-medium text-destructive border border-destructive/30 rounded-sm hover:bg-destructive/5 transition-colors disabled:opacity-50`}
            >
              <Trash2 size={16} />
              {deleting ? "삭제 중..." : "삭제"}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {editable && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || deleting}
                className={`flex items-center gap-1.5 px-5 py-2 ${LIST_TEXT} font-semibold bg-primary text-primary-foreground rounded-sm hover:bg-accent transition-colors disabled:opacity-50`}
              >
                <Save size={16} />
                {saving ? "저장 중..." : "저장"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={deleting}
              className={`px-5 py-2 ${LIST_TEXT} font-medium border border-border rounded-sm hover:bg-secondary transition-colors disabled:opacity-50`}
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
