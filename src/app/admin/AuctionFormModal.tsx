"use client";

import { useEffect, useState } from "react";
import type { AuctionItem, UpdateAuctionPayload } from "@/types/auction";
import { createAuction, updateAuction, updateMyAuction } from "@/lib/api";
import {
  AUCTION_FIELD_GROUPS,
  EMPTY_AUCTION_FORM,
  toFormState,
  toPayload,
  type FieldDef,
} from "@/lib/auction-form";

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: string | number | null;
  onChange: (v: string) => void;
}) {
  const className =
    "w-full px-3 py-2 text-sm bg-input-background border border-border rounded-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  if (field.type === "textarea") {
    return (
      <textarea
        rows={2}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      />
    );
  }

  return (
    <input
      type="text"
      inputMode={field.type === "number" ? "numeric" : "text"}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    />
  );
}

export function AuctionFormModal({
  mode,
  item,
  open,
  onClose,
  onSaved,
  editScope = "admin",
}: {
  mode: "create" | "edit";
  item: AuctionItem | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editScope?: "admin" | "consultant";
}) {
  const [form, setForm] = useState<UpdateAuctionPayload>(EMPTY_AUCTION_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && item) {
      setForm(toFormState(item));
    } else {
      setForm(EMPTY_AUCTION_FORM);
    }
    setError("");
  }, [open, mode, item]);

  if (!open) return null;

  const isAdminCreate = mode === "create" && editScope === "admin";

  const setField = (key: keyof UpdateAuctionPayload, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = toPayload(form);
      if (mode === "edit" && item) {
        if (editScope === "consultant") {
          await updateMyAuction(item.id, payload);
        } else {
          await updateAuction(item.id, payload);
        }
      } else {
        await createAuction(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-card border border-border rounded-sm shadow-lg flex flex-col">
        <div className="px-6 py-4 border-b border-border shrink-0">
          <h3 className="text-base font-bold text-foreground">
            {mode === "edit" ? "물건 정보 수정" : "물건 수동 등록"}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {mode === "edit"
              ? item?.auctionNo || item?.address
              : isAdminCreate
                ? "관리자 등록은 즉시 검색 페이지에 노출됩니다."
                : "입력 후 관리자 승인을 받으면 검색 페이지에 노출됩니다."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5 space-y-6 flex-1">
          {AUCTION_FIELD_GROUPS.map((group) => (
            <div key={group.title}>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {group.title}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {group.fields.map((field) => (
                  <div key={field.key} className={field.full ? "sm:col-span-2" : ""}>
                    <label className="block text-xs font-medium text-foreground/70 mb-1">
                      {field.label}
                    </label>
                    <FieldInput
                      field={field}
                      value={form[field.key] as string | number | null}
                      onChange={(v) => setField(field.key, v)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {error && (
            <p className="text-sm text-destructive border border-destructive/30 bg-destructive/5 rounded-sm px-3 py-2">
              {error}
            </p>
          )}
        </form>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground border border-border rounded-sm hover:text-foreground transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-sm hover:bg-accent transition-colors disabled:opacity-50"
          >
            {saving ? "저장 중..." : mode === "edit" ? "저장" : isAdminCreate ? "등록" : "등록 요청"}
          </button>
        </div>
      </div>
    </div>
  );
}
