"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchLandingImages,
  resetLandingImage,
  updateLandingImage,
  uploadLandingImageFile,
  type LandingImage,
} from "@/lib/api";

/** 강의실 메인(/courses) 소개 페이지 이미지를 슬롯별로 관리한다.
 * 슬롯 목록/권장 사이즈는 백엔드(LANDING_IMAGE_SLOTS)가 소유하고 있어,
 * 슬롯이 추가되면 API 응답에 자동으로 반영된다. */
export function LandingImagesPanel() {
  const [images, setImages] = useState<LandingImage[] | null>(null);
  const [error, setError] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [urlDrafts, setUrlDrafts] = useState<Record<string, string>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function load() {
    fetchLandingImages()
      .then((list) => {
        setImages(list);
        setUrlDrafts(Object.fromEntries(list.map((img) => [img.key, img.imageUrl])));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "이미지를 불러오지 못했습니다."));
  }

  useEffect(() => {
    load();
  }, []);

  async function applyUrl(key: string) {
    const url = urlDrafts[key]?.trim();
    if (!url) return;
    setSavingKey(key);
    setError("");
    try {
      const updated = await updateLandingImage(key, url);
      setImages((prev) => prev?.map((img) => (img.key === key ? updated : img)) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "이미지 변경에 실패했습니다.");
    } finally {
      setSavingKey(null);
    }
  }

  async function handleFileSelect(key: string, file: File) {
    setSavingKey(key);
    setError("");
    try {
      const { url } = await uploadLandingImageFile(file);
      const updated = await updateLandingImage(key, url);
      setImages((prev) => prev?.map((img) => (img.key === key ? updated : img)) ?? null);
      setUrlDrafts((prev) => ({ ...prev, [key]: updated.imageUrl }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "이미지 업로드에 실패했습니다.");
    } finally {
      setSavingKey(null);
    }
  }

  async function handleReset(key: string) {
    setSavingKey(key);
    setError("");
    try {
      const updated = await resetLandingImage(key);
      setImages((prev) => prev?.map((img) => (img.key === key ? updated : img)) ?? null);
      setUrlDrafts((prev) => ({ ...prev, [key]: updated.imageUrl }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "초기화에 실패했습니다.");
    } finally {
      setSavingKey(null);
    }
  }

  if (images === null) return <p className="text-sm text-muted-foreground p-4">불러오는 중...</p>;

  return (
    <div className="p-4">
      <h3 className="text-sm font-bold text-foreground mb-1">강의실 메인 이미지</h3>
      <p className="text-xs text-muted-foreground mb-4">
        /courses 소개 페이지에 쓰이는 이미지를 슬롯별로 교체합니다. URL을 직접 입력하거나 파일을 업로드할 수 있습니다.
      </p>
      {error && <p className="text-xs text-destructive mb-3">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {images.map((img) => {
          const saving = savingKey === img.key;
          return (
            <div key={img.key} className="rounded-sm border border-border bg-card p-3 flex gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.imageUrl}
                alt={img.label}
                className="w-24 h-24 object-cover rounded-sm border border-border shrink-0 bg-muted"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground truncate">{img.label}</span>
                  {img.isCustom && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                      교체됨
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">권장 사이즈: {img.recommendedSize}</p>

                <div className="flex gap-1.5 mb-1.5">
                  <input
                    type="text"
                    value={urlDrafts[img.key] ?? ""}
                    onChange={(e) => setUrlDrafts((prev) => ({ ...prev, [img.key]: e.target.value }))}
                    placeholder="이미지 URL 입력"
                    className="flex-1 min-w-0 text-xs px-2 py-1.5 rounded-sm border border-border bg-background"
                  />
                  <button
                    type="button"
                    onClick={() => void applyUrl(img.key)}
                    disabled={saving}
                    className="text-xs px-2.5 py-1.5 rounded-sm bg-primary text-primary-foreground font-semibold disabled:opacity-50 shrink-0"
                  >
                    적용
                  </button>
                </div>

                <div className="flex gap-1.5">
                  <input
                    ref={(el) => {
                      fileInputRefs.current[img.key] = el;
                    }}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleFileSelect(img.key, file);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRefs.current[img.key]?.click()}
                    disabled={saving}
                    className="text-xs px-2.5 py-1.5 rounded-sm border border-border font-semibold disabled:opacity-50"
                  >
                    파일 업로드
                  </button>
                  {img.isCustom && (
                    <button
                      type="button"
                      onClick={() => void handleReset(img.key)}
                      disabled={saving}
                      className="text-xs px-2.5 py-1.5 rounded-sm border border-border text-muted-foreground disabled:opacity-50"
                    >
                      기본값으로
                    </button>
                  )}
                  {saving && <span className="text-xs text-muted-foreground self-center">저장 중...</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
