import SERVER_ADDRESS from "../config";
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

// ✅ serial의 숫자부 길이 추출 (예: ABS4-0311000 -> 7)
function getSerialNumberLength(serial) {
  const m = String(serial || "").match(/(\d+)\s*$/);
  return m ? m[1].length : 7;
}

export default function GiftBoxPrintCursor() {
  const [searchParams] = useSearchParams();

  // URL 기반 파라미터
  const generatorName = searchParams.get("generator_name") || "";
  const start = useMemo(
    () => parseInt(searchParams.get("start") || "", 10),
    [searchParams]
  );
  const count = useMemo(
    () => parseInt(searchParams.get("count") || "", 10),
    [searchParams]
  );

  // ===============================
  // 공통 state
  // ===============================
  const [pageLoading, setPageLoading] = useState(false);

  // 기본(일반) 커서 목록
  const [cursor, setCursor] = useState(null);
  const [pageData, setPageData] = useState([]);
  const [hasNext, setHasNext] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [pageNoBase, setPageNoBase] = useState(0);

  // serial digit length
  const [serialDigitLength, setSerialDigitLength] = useState(7);

  // ===============================
  // 선택 모드(start/count 기반) state
  // ===============================
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  const [totalCount, setTotalCount] = useState(0);
  const [selectionOffsetBase, setSelectionOffsetBase] = useState(0); // 전체 목록 기준 offset (No 표시용)
  const [selectionFirstCursor, setSelectionFirstCursor] = useState(null); // start 위치 커서
  const [selectionCursor, setSelectionCursor] = useState(null); // 현재 페이지 커서(선택 범위 내)
  const [selectionPageIndex, setSelectionPageIndex] = useState(0); // 0,1,2... (선택 범위 페이지)
  const [selectionData, setSelectionData] = useState([]);
  const [selectionHasNext, setSelectionHasNext] = useState(false);
  const [selectionNextCursor, setSelectionNextCursor] = useState(null);
  const [selectionLoading, setSelectionLoading] = useState(false);

  // ===============================
  // 검색 모드(MAC 검색) state
  // ===============================
  const [macSearch, setMacSearch] = useState("");
  const [isMacSearchMode, setIsMacSearchMode] = useState(false);
  const [macSearchRows, setMacSearchRows] = useState([]);

  const clearMacSearchMode = () => {
    setIsMacSearchMode(false);
    setMacSearchRows([]);
  };

  // ===============================
  // 1) 일반 cursor 기반 목록 로딩 (100개 단위)
  // ===============================
  useEffect(() => {
    if (!generatorName) return;
    if (isSelectionMode) return;

    const params = new URLSearchParams();
    params.set("generator_name", generatorName);
    params.set("limit", "100");
    if (cursor !== null && cursor !== undefined)
      params.set("cursor", String(cursor));

    setPageLoading(true);

    fetch(
      `${SERVER_ADDRESS}/api/print/giftbox_status_cursor?${params.toString()}`
    )
      .then((r) => r.json())
      .then((json) => {
        if (!json?.success) {
          setPageData([]);
          setHasNext(false);
          setNextCursor(null);
          return;
        }

        const list = Array.isArray(json.data) ? json.data : [];
        setPageData(list);
        setHasNext(json.hasNext === true);
        setNextCursor(json.nextCursor ?? null);

        const firstSerial = list?.[0]?.serial;
        if (firstSerial) {
          const len = getSerialNumberLength(firstSerial);
          setSerialDigitLength((prev) => (prev !== len ? len : prev));
        }
      })
      .catch((e) => {
        console.error("❌ giftbox_status_cursor error:", e);
        setPageData([]);
        setHasNext(false);
        setNextCursor(null);
      })
      .finally(() => setPageLoading(false));
  }, [generatorName, cursor, isSelectionMode]);

  // ===============================
  // 2) 선택 모드 진입: start/count가 유효하면
  // ===============================
  useEffect(() => {
    if (!generatorName) return;

    const validStart = Number.isFinite(start) && start > 0;
    const validCount = Number.isFinite(count) && count > 0;

    if (!validStart || !validCount) {
      setIsSelectionMode(false);
      setSelectionData([]);
      setSelectionFirstCursor(null);
      setSelectionCursor(null);
      setSelectionPageIndex(0);
      setSelectionOffsetBase(0);
      setSelectionHasNext(false);
      setSelectionNextCursor(null);
      return;
    }

    setIsSelectionMode(true);

    const run = async () => {
      setSelectionLoading(true);
      try {
        const warmRes = await fetch(
          `${SERVER_ADDRESS}/api/print/giftbox_status_cursor?generator_name=${encodeURIComponent(
            generatorName
          )}&limit=1`
        );
        const warmJson = await warmRes.json();
        const warmFirstSerial = warmJson?.data?.[0]?.serial;

        const digitLen = warmFirstSerial
          ? getSerialNumberLength(warmFirstSerial)
          : serialDigitLength;

        setSerialDigitLength((prev) => (prev !== digitLen ? digitLen : prev));

        const prefix = String(warmFirstSerial || "").split("-")[0] || "";
        const buildSerial = (num) =>
          `${prefix}-${String(num).padStart(digitLen, "0")}`;

        const startSerial = buildSerial(start);

        const findRes = await fetch(
          `${SERVER_ADDRESS}/api/print/find_serial_cursor?generator_name=${encodeURIComponent(
            generatorName
          )}&serial=${encodeURIComponent(startSerial)}&limit=100`
        );
        const findJson = await findRes.json();

        if (!findJson?.success) {
          setSelectionData([]);
          setTotalCount(findJson?.totalCount ?? 0);
          return;
        }

        setTotalCount(findJson?.totalCount ?? 0);
        setSelectionOffsetBase(findJson?.offset ?? 0);

        const firstCur = findJson.cursor ?? null;
        setSelectionFirstCursor(firstCur);
        setSelectionCursor(firstCur);
        setSelectionPageIndex(0);
      } catch (e) {
        console.error("❌ selection init error:", e);
        setSelectionData([]);
      } finally {
        setSelectionLoading(false);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatorName, start, count]);

  // ===============================
  // 3) 선택 모드: 남은 count 만큼만 표시되도록 limit 조절
  // ===============================
  useEffect(() => {
    if (!isSelectionMode) return;
    if (!generatorName) return;
    if (selectionCursor === undefined) return;

    const pageSize = 100;
    const remaining = Math.max(count - selectionPageIndex * pageSize, 0);
    const limit = Math.min(pageSize, remaining);

    if (limit <= 0) {
      setSelectionData([]);
      setSelectionHasNext(false);
      setSelectionNextCursor(null);
      return;
    }

    const run = async () => {
      setSelectionLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("generator_name", generatorName);
        params.set("limit", String(limit));
        if (selectionCursor !== null && selectionCursor !== undefined) {
          params.set("cursor", String(selectionCursor));
        }

        const res = await fetch(
          `${SERVER_ADDRESS}/api/print/giftbox_status_cursor?${params.toString()}`
        );
        const json = await res.json();

        if (!json?.success) {
          setSelectionData([]);
          setSelectionHasNext(false);
          setSelectionNextCursor(null);
          return;
        }

        const list = Array.isArray(json.data) ? json.data : [];
        setSelectionData(list);

        const nextRemaining = Math.max(
          count - (selectionPageIndex + 1) * 100,
          0
        );
        const inRangeNext = nextRemaining > 0;

        setSelectionHasNext(json.hasNext === true && inRangeNext);
        setSelectionNextCursor(json.nextCursor ?? null);
      } catch (e) {
        console.error("❌ selection page fetch error:", e);
        setSelectionData([]);
        setSelectionHasNext(false);
        setSelectionNextCursor(null);
      } finally {
        setSelectionLoading(false);
      }
    };

    run();
  }, [
    isSelectionMode,
    generatorName,
    selectionCursor,
    selectionPageIndex,
    count,
  ]);

  // ===============================
  // 4) MAC 검색
  // ===============================
  const handleMacSearch = async () => {
    if (!macSearch.trim() || !generatorName) return;

    try {
      const res = await fetch(
        `${SERVER_ADDRESS}/api/print/search_mac?generator_name=${encodeURIComponent(
          generatorName
        )}&mac=${encodeURIComponent(macSearch.trim())}`
      );

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        console.error("❌ search_mac http error:", res.status, t);
        alert("검색 중 오류가 발생했습니다.");
        return;
      }

      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];

      if (!json?.success || list.length === 0) {
        alert("해당 MAC을 찾을 수 없습니다.");
        return;
      }

      setIsMacSearchMode(true);
      setMacSearchRows(list);
    } catch (e) {
      console.error("❌ search_mac error:", e);
      alert("검색 중 오류가 발생했습니다.");
    }
  };

  // ===============================
  // 버튼 동작
  // ===============================
  const onFirstClick = () => {
    if (isMacSearchMode) clearMacSearchMode();

    if (isSelectionMode) {
      setSelectionCursor(selectionFirstCursor ?? null);
      setSelectionPageIndex(0);
      return;
    }

    setCursor(null);
    setPageNoBase(0);
  };

  const onNextClick = () => {
    if (isMacSearchMode) clearMacSearchMode();

    if (isSelectionMode) {
      if (selectionHasNext && selectionNextCursor) {
        setSelectionCursor(selectionNextCursor);
        setSelectionPageIndex((v) => v + 1);
      }
      return;
    }

    if (hasNext && nextCursor) {
      setCursor(nextCursor);
      setPageNoBase((v) => v + 100);
    }
  };

  // ===============================
  // 표시 데이터
  // ===============================
  const getRowClassName = (row) =>
    row.is_printed ? "row-printed" : "row-pending";

  const effectiveData = isSelectionMode ? selectionData : pageData;
  const effectiveLoading = isSelectionMode ? selectionLoading : pageLoading;

  const noBase = isMacSearchMode
    ? 0
    : isSelectionMode
    ? selectionOffsetBase + selectionPageIndex * 100
    : pageNoBase;

  const displayData = isMacSearchMode ? macSearchRows : effectiveData;

  const selectionFrom = isSelectionMode ? selectionPageIndex * 100 + 1 : null;
  const selectionTo = isSelectionMode
    ? Math.min((selectionPageIndex + 1) * 100, count)
    : null;

  const nextDisabled = isMacSearchMode
    ? false
    : isSelectionMode
    ? !selectionHasNext || !selectionNextCursor
    : !hasNext || !nextCursor;

  return (
    <div className="print-container">
      <div className="header">
        <h2 className="title">📦 GiftBox 출력 현황</h2>

        {/* ✅ 검색 + 상태표시를 같은 라인 끝에 배치 */}
        <div className="top-row">
          <div className="search-box">
            <input
              className="search-input"
              placeholder="MAC Address 검색"
              value={macSearch}
              onChange={(e) => setMacSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleMacSearch();
              }}
            />
            <button onClick={handleMacSearch}>검색</button>
            {isMacSearchMode && (
              <button
                onClick={() => {
                  clearMacSearchMode();
                  setMacSearch("");
                }}
              >
                검색 해제
              </button>
            )}
          </div>

          {/* ✅ 기존 "출력 시작/갯수/표시..." 를 같은 라인 오른쪽 끝으로 */}
          <div className="status-line">
            <strong>출력 시작:</strong> {Number.isFinite(start) ? start : "-"}
            <span className="sep" />
            <strong>출력 갯수:</strong> {Number.isFinite(count) ? count : "-"}
            {isSelectionMode && !isMacSearchMode && (
              <>
                <span className="sep" />
                <strong>표시:</strong> {selectionFrom} ~ {selectionTo} / {count}
                <span className="sep" />
                <strong>전체 오프셋:</strong> {selectionOffsetBase + 1} ~{" "}
                {selectionOffsetBase + Math.min(100, count)}
                {totalCount ? ` / ${totalCount}` : ""}
              </>
            )}
            {isMacSearchMode && (
              <>
                <span className="sep" />
                <strong>검색 결과:</strong> {macSearchRows.length}건
              </>
            )}
          </div>
        </div>
      </div>

      {/* ✅ 스크롤 영역 */}
      <div className="table-scroll">
        <table
          className="print-table"
          style={{ width: "100%", borderCollapse: "collapse" }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>No</th>
              <th style={{ textAlign: "left" }}>MAC</th>
              <th style={{ textAlign: "left" }}>Serial</th>
              <th style={{ textAlign: "left" }}>Artist</th>
              <th style={{ textAlign: "left" }}>Lightstick</th>
              <th style={{ textAlign: "left" }}>출력</th>
            </tr>
          </thead>

          <tbody>
            {displayData.map((row, idx) => (
              <tr
                key={`${row.id ?? row.serial ?? row.mac_address ?? idx}-${idx}`}
                className={getRowClassName(row)}
              >
                <td style={{ padding: "6px 8px" }}>{noBase + idx + 1}</td>
                <td style={{ padding: "6px 8px" }}>{row.mac_address}</td>
                <td style={{ padding: "6px 8px" }}>{row.serial}</td>
                <td style={{ padding: "6px 8px" }}>{row.artist ?? "-"}</td>
                <td style={{ padding: "6px 8px" }}>{row.lightstick ?? "-"}</td>
                <td
                  style={{
                    padding: "6px 8px",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {row.is_printed ? (
                    <span>출력</span>
                  ) : (
                    <>
                      <span className="pending-icon" title="미출력">
                        ⏳
                      </span>
                      <span>미출력</span>
                    </>
                  )}
                </td>
              </tr>
            ))}

            {!isMacSearchMode && effectiveLoading && (
              <tr>
                <td colSpan={6} style={{ padding: 12 }}>
                  로딩 중...
                </td>
              </tr>
            )}

            {!isMacSearchMode &&
              !effectiveLoading &&
              displayData.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 12 }}>
                    표시할 데이터가 없습니다.
                  </td>
                </tr>
              )}

            {isMacSearchMode && displayData.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 12 }}>
                  검색 결과가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ✅ 처음/다음 버튼은 리스트 아래 */}
      <div className="pager">
        <button onClick={onFirstClick}>처음</button>
        <button onClick={onNextClick} disabled={nextDisabled}>
          다음
        </button>
      </div>

      <style>{`
        .print-container {
          height: 100vh;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .header { flex: 0 0 auto; }

        /* ✅ 검색라인 + 상태라인 한줄 배치 */
        .top-row{
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 6px 0;
        }

        .search-box{
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 0 0 auto;
        }

        .search-input{
          width: 280px;
        }

        .status-line{
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0;
          flex: 1 1 auto;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .sep{
          display: inline-block;
          width: 12px;
        }

        .table-scroll {
          flex: 1 1 auto;
          overflow: auto;
          min-height: 0;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
        }

        /* ✅ 헤더를 바디랑 동일 */
        .print-table thead th {
          position: static;
          background: inherit;
        }

        .pager {
          flex: 0 0 auto;
          display: flex;
          gap: 8px;
          padding: 6px 0;
        }

        .row-printed { background: rgba(46, 204, 113, 0.18); }
        .row-pending { background: transparent; }
        .pending-icon { opacity: 0.85; font-size: 14px; line-height: 1; }
      `}</style>
    </div>
  );
}
