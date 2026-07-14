"use client";

import { useEffect, useState } from "react";
import {
  fetchLoanPolicies,
  updateLoanPolicy,
  fetchRegulatedRegions,
  addRegulatedRegion,
  removeRegulatedRegion,
  fetchIncomeLoanMultiplier,
  updateIncomeLoanMultiplier,
  type LoanPolicy,
  type RegulatedRegion,
} from "@/lib/api";
import { CITIES, getDistricts, getWards } from "@/data/korea-regions";

/** 검색 필터와 동일한 시/도 표시명(마지막 "특별시/광역시/도" 등 접미어 제거) */
function shortCityLabel(city: string): string {
  return city.replace(/(특별자치시|특별자치도|특별시|광역시|자치도|도)$/u, "");
}

export function LoanPolicyTab() {
  const [policies, setPolicies] = useState<LoanPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [incomeMultiplier, setIncomeMultiplier] = useState<number | null>(null);
  const [incomeMultiplierInput, setIncomeMultiplierInput] = useState("");
  const [incomeMultiplierSaving, setIncomeMultiplierSaving] = useState(false);
  const [incomeMultiplierMessage, setIncomeMultiplierMessage] = useState<string | null>(null);

  const [regions, setRegions] = useState<RegulatedRegion[]>([]);
  const [regionsLoading, setRegionsLoading] = useState(true);
  const [regionSaving, setRegionSaving] = useState(false);
  const [regionMessage, setRegionMessage] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [selectedWards, setSelectedWards] = useState<Set<string>>(new Set());
  const [wardOptions, setWardOptions] = useState<string[]>([]);
  const [wardsLoading, setWardsLoading] = useState(false);
  const districtOptions = selectedCity ? getDistricts(selectedCity) : [];

  function toggleWard(ward: string) {
    setSelectedWards((prev) => {
      const next = new Set(prev);
      if (next.has(ward)) next.delete(ward);
      else next.add(ward);
      return next;
    });
  }

  useEffect(() => {
    if (!selectedCity || !selectedDistrict) {
      setWardOptions([]);
      return;
    }
    setWardsLoading(true);
    getWards(selectedCity, selectedDistrict)
      .then(setWardOptions)
      .finally(() => setWardsLoading(false));
  }, [selectedCity, selectedDistrict]);

  useEffect(() => {
    fetchLoanPolicies()
      .then(setPolicies)
      .finally(() => setLoading(false));
    fetchRegulatedRegions()
      .then(setRegions)
      .finally(() => setRegionsLoading(false));
    fetchIncomeLoanMultiplier().then((value) => {
      setIncomeMultiplier(value);
      setIncomeMultiplierInput(String(value));
    });
  }, []);

  async function handleSaveIncomeMultiplier() {
    const value = Number(incomeMultiplierInput);
    if (!Number.isFinite(value) || value <= 0) {
      setIncomeMultiplierMessage("0보다 큰 숫자를 입력해 주세요.");
      return;
    }
    setIncomeMultiplierSaving(true);
    setIncomeMultiplierMessage(null);
    try {
      const saved = await updateIncomeLoanMultiplier(value);
      setIncomeMultiplier(saved);
      setIncomeMultiplierInput(String(saved));
      setIncomeMultiplierMessage("저장되었습니다.");
    } catch (err) {
      setIncomeMultiplierMessage(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setIncomeMultiplierSaving(false);
    }
  }

  async function saveRegionName(name: string) {
    if (!name.trim()) return true;
    try {
      const added = await addRegulatedRegion(name.trim());
      setRegions((prev) =>
        prev.some((r) => r.id === added.id)
          ? prev
          : [...prev, added].sort((a, b) => a.name.localeCompare(b.name, "ko")),
      );
      return true;
    } catch (err) {
      setRegionMessage(err instanceof Error ? err.message : `"${name}" 추가에 실패했습니다.`);
      return false;
    }
  }

  async function handleAddRegion() {
    // 읍/면/동을 하나 이상 체크하면 체크된 것들만 각각, 아무것도 체크하지
    // 않았으면 구/군 전체(또는 구/군도 없으면 시/도 전체)를 등록.
    const names =
      selectedWards.size > 0
        ? [...selectedWards]
        : [selectedDistrict || shortCityLabel(selectedCity)];

    setRegionSaving(true);
    setRegionMessage(null);
    let failed = false;
    for (const name of names) {
      const ok = await saveRegionName(name);
      if (!ok) failed = true;
    }
    setRegionSaving(false);
    if (!failed) {
      setSelectedCity("");
      setSelectedDistrict("");
      setSelectedWards(new Set());
    }
  }

  async function handleRemoveRegion(id: string) {
    setRegionMessage(null);
    try {
      await removeRegulatedRegion(id);
      setRegions((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setRegionMessage(err instanceof Error ? err.message : "규제지역 삭제에 실패했습니다.");
    }
  }

  function patchLocal(id: string, field: "loanRatio" | "appraisalRatio", percent: string) {
    setPolicies((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: Number(percent) / 100 } : p)),
    );
    setMessage(null);
  }

  async function handleSave(policy: LoanPolicy) {
    setSavingId(policy.id);
    setMessage(null);
    try {
      const updated = await updateLoanPolicy(policy.id, {
        loanRatio: policy.loanRatio,
        appraisalRatio: policy.appraisalRatio,
      });
      setPolicies((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setMessage(`"${policy.label}" 정책이 저장되었습니다.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground p-6">불러오는 중...</p>;
  }

  return (
    <div className="p-6 space-y-8 max-w-4xl">
      <div>
        <h2 className="text-lg font-bold text-foreground">규제지역 목록</h2>
        <p className="text-sm text-muted-foreground mt-1">
          검색 필터와 동일한 지역 목록에서 시/도, 구/군, 읍/면/동을 선택해 규제지역을
          등록합니다. 등록된 지역에 해당하는 물건은 자동으로 규제지역으로 분류됩니다.
        </p>

        {regionMessage && (
          <div className="text-sm px-3 py-2 mt-3 rounded-sm border border-destructive/30 bg-destructive/5 text-destructive">
            {regionMessage}
          </div>
        )}

        <div className="flex items-center gap-2 mt-3">
          <select
            value={selectedCity}
            onChange={(e) => {
              setSelectedCity(e.target.value);
              setSelectedDistrict("");
              setSelectedWards(new Set());
            }}
            className="px-3 py-2 text-sm border border-border rounded-sm bg-card"
          >
            <option value="">시/도 선택</option>
            {CITIES.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
          <select
            value={selectedDistrict}
            onChange={(e) => {
              setSelectedDistrict(e.target.value);
              setSelectedWards(new Set());
            }}
            disabled={!selectedCity}
            className="flex-1 px-3 py-2 text-sm border border-border rounded-sm bg-card disabled:opacity-50"
          >
            <option value="">
              {selectedCity ? `${shortCityLabel(selectedCity)} 전체(구/군 미선택)` : "구/군 선택"}
            </option>
            {districtOptions.map((district) => (
              <option key={district} value={district}>
                {district}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void handleAddRegion()}
            disabled={regionSaving || !selectedCity}
            className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50 shrink-0"
          >
            {regionSaving ? "추가 중..." : "추가"}
          </button>
        </div>

        {selectedDistrict && (
          <div className="mt-3 border border-border rounded-sm p-3">
            <p className="text-xs text-muted-foreground mb-2">
              {wardsLoading
                ? "읍/면/동 목록 불러오는 중..."
                : wardOptions.length === 0
                  ? "읍/면/동 세부 목록이 없습니다."
                  : `읍/면/동을 체크하면 체크된 곳만, 아무것도 체크하지 않으면 ${selectedDistrict} 전체가 등록됩니다.`}
            </p>
            {wardOptions.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 max-h-40 overflow-y-auto">
                {wardOptions.map((ward) => (
                  <label
                    key={ward}
                    className="flex items-center gap-1.5 text-sm text-foreground cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedWards.has(ward)}
                      onChange={() => toggleWard(ward)}
                    />
                    {ward}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-1.5">
          구/군을 선택하지 않으면 시/도 전체가, 읍/면/동을 하나도 체크하지 않으면 선택한
          구/군 전체가 규제지역으로 등록됩니다.
        </p>

        {regionsLoading ? (
          <p className="text-sm text-muted-foreground mt-3">불러오는 중...</p>
        ) : regions.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-3">등록된 규제지역이 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2 mt-3">
            {regions.map((region) => (
              <span
                key={region.id}
                className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 text-sm rounded-full border border-red-200 bg-red-50 text-red-700"
              >
                {region.name}
                <button
                  type="button"
                  onClick={() => void handleRemoveRegion(region.id)}
                  className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-red-100"
                  aria-label={`${region.name} 삭제`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-bold text-foreground">소득 대비 대출 배수</h2>
        <p className="text-sm text-muted-foreground mt-1">
          연소득의 몇 배까지 대출이 가능하다고 볼지 설정합니다(DSR 근사치). 감정가·낙찰가
          기준 대출한도가 더 높더라도, 이 소득 기준 한도를 넘지 못합니다.
        </p>
        {incomeMultiplierMessage && (
          <div className="text-sm px-3 py-2 mt-3 rounded-sm border border-border bg-secondary/30">
            {incomeMultiplierMessage}
          </div>
        )}
        <div className="flex items-center gap-2 mt-3">
          <span className="text-sm text-muted-foreground">연소득 ×</span>
          <input
            type="number"
            min={1}
            step={0.5}
            value={incomeMultiplierInput}
            onChange={(e) => setIncomeMultiplierInput(e.target.value)}
            className="w-20 px-2 py-1.5 text-sm text-right border border-border rounded-sm bg-card"
          />
          <span className="text-sm text-muted-foreground">배</span>
          <button
            type="button"
            onClick={() => void handleSaveIncomeMultiplier()}
            disabled={incomeMultiplierSaving || incomeMultiplier == null}
            className="px-4 py-2 text-sm font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50"
          >
            {incomeMultiplierSaving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold text-foreground">대출 정책 관리</h2>
        <p className="text-sm text-muted-foreground mt-1">
          회원정보(주택수·생애최초 여부)와 위 규제지역 목록 매칭 결과에 따라 추천 서비스에
          자동 적용되는 대출 비율입니다. 실제 대출한도는{" "}
          <span className="font-medium text-foreground">
            min(감정가 × 감정가비율, 낙찰가 × 낙찰가비율, 연소득 × 소득배수)
          </span>
          에서 기존대출을 뺀 값으로 계산됩니다.
        </p>
      </div>

      {message && (
        <div className="text-sm px-3 py-2 rounded-sm border border-border bg-secondary/30">
          {message}
        </div>
      )}

      <div className="border border-border rounded-sm overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-left">
              <th className="px-4 py-2.5 font-semibold text-foreground whitespace-nowrap">정책</th>
              <th className="px-3 py-2.5 font-semibold text-foreground text-right whitespace-nowrap w-28">
                감정가 비율
              </th>
              <th className="px-3 py-2.5 font-semibold text-foreground text-right whitespace-nowrap w-28">
                낙찰가 비율
              </th>
              <th className="px-4 py-2.5 w-20" />
            </tr>
          </thead>
          <tbody>
            {policies.map((policy) => (
              <tr key={policy.id} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 align-middle">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5 whitespace-nowrap">
                    {policy.label}
                    {policy.regulatedArea && (
                      <span className="inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded-sm border bg-red-50 text-red-700 border-red-200 shrink-0">
                        규제지역
                      </span>
                    )}
                    {policy.businessLoanOnly && (
                      <span className="inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded-sm border bg-amber-50 text-amber-700 border-amber-200 shrink-0">
                        사업자대출만 · 단타만 가능
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {policy.loanUnavailable
                      ? "대출 불가 (비율 지정 불가)"
                      : "min(감정가비율, 낙찰가비율) 중 낮은 쪽이 최종 적용"}
                  </p>
                </td>
                {policy.loanUnavailable ? (
                  <td colSpan={3} className="px-4 py-3 text-right align-middle">
                    <span className="text-sm text-destructive font-semibold">대출 불가</span>
                  </td>
                ) : (
                  <>
                    <td className="px-3 py-3 align-middle">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={Math.round(policy.appraisalRatio * 100)}
                          onChange={(e) => patchLocal(policy.id, "appraisalRatio", e.target.value)}
                          className="w-16 px-2 py-1.5 text-sm text-right border border-border rounded-sm bg-card"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={Math.round(policy.loanRatio * 100)}
                          onChange={(e) => patchLocal(policy.id, "loanRatio", e.target.value)}
                          className="w-16 px-2 py-1.5 text-sm text-right border border-border rounded-sm bg-card"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <button
                        type="button"
                        onClick={() => void handleSave(policy)}
                        disabled={savingId === policy.id}
                        className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-primary text-primary-foreground disabled:opacity-50 whitespace-nowrap"
                      >
                        {savingId === policy.id ? "저장 중..." : "저장"}
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
