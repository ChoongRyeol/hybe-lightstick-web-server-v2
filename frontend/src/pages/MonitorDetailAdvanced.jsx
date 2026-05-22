// src/pages/MonitorDetailAdvanced.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SERVER_ADDRESS from "../config";
import dayjs from "dayjs";

// ✅ 탭 정의
const TABS = [
  { key: "mac_write", label: "MAC WRITE" },
  { key: "compare", label: "MAC COMPARE" },
  { key: "device_print", label: "DEVICE PRINT" },
  { key: "giftbox_print", label: "GIFTBOX PRINT" },
  { key: "cartonbox_print", label: "CARTONBOX PRINT" },
];

// ✅ 탭별 표시 컬럼
const COLUMNS = {
  mac_write: [
    "line",
    "created_at",
    "updated_at",
    "generator_name",
    "artist",
    "lightstick",
    "serial",
    "mac_address",
    "fw_version",
    "device_name",
    "result",
    "description",
  ],
  compare: [
    "line",
    "created_at",
    "updated_at",
    "generator_name",
    "artist",
    "lightstick",
    "serial",
    "mac_address",
    "fw_version",
    "device_name",
    "result",
    "description",
  ],
  device_print: [
    "line",
    "generator_name",
    "mac_address",
    "serial",
    "artist",
    "lightstick",
    "certification_info",
    "printed_at",
    "updated_at",
    "user_id",
    "user_name",
  ],
  giftbox_print: [
    "line",
    "generator_name",
    "mac_address",
    "serial",
    "artist",
    "lightstick",
    "certification_info",
    "printed_at",
    "updated_at",
    "user_id",
    "user_name",
  ],
  cartonbox_print: [
    "src",
    "line",
    "generator_name",
    "box_count",
    "box_total_count",
    "mac_address",
    "serial",
    "artist",
    "lightstick",
    "model",
    "factory_date",
    "description",
    "printed_at",
    "updated_at",
    "user_id",
    "user_name",
  ],
};

// ✅ 컬럼 → 한글 헤더
const HEADERS = {
  line: "라인",
  created_at: "작업일",
  updated_at: "작업일(수정)",
  generator_name: "생산관리명",
  artist: "아티스트",
  lightstick: "응원봉",
  serial: "시리얼",
  mac_address: "MAC",
  fw_version: "FW 버전",
  device_name: "디바이스",
  result: "결과",
  src: "구분",
  description: "설명",
  certification_info: "인증",
  printed_at: "출력시간",
  user_id: "작업자ID",
  user_name: "작업자명",
  model: "모델",
  factory_date: "제조일",
  box_count: "박스 번호",
  box_total_count: "총 박스 수",
};

// ✅ 모든 컬럼 최소 폭: 100 (요구사항)
const COL_MIN_WIDTH = {
  line: 100,
  created_at: 100,
  updated_at: 100,
  generator_name: 100,
  artist: 100,
  lightstick: 100,
  serial: 100,
  mac_address: 100,
  fw_version: 100,
  device_name: 100,
  result: 100,
  src: 100,
  description: 100,
  certification_info: 100,
  printed_at: 100,
  user_id: 100,
  user_name: 100,
  model: 100,
  factory_date: 100,
  box_count: 100,
  box_total_count: 100,
};

const toLocalInput = (v) => {
  if (!v) return "";
  const d = dayjs(v);
  return d.isValid() ? d.format("YYYY-MM-DDTHH:mm") : "";
};

// ✅ 하이라이트/리사이즈 CSS 1회 주입
const injectOnce = (() => {
  let done = false;
  return () => {
    if (done) return;
    const style = document.createElement("style");
    style.innerHTML = `
      mark.__mes { background: #ffe08a; padding: 0 2px; border-radius: 3px; }
      .highlight-pulse { animation: mesPulse 1.8s ease-in-out 2; }
      @keyframes mesPulse {
        0% { background-color: rgba(79,195,247,0.15); }
        50% { background-color: rgba(79,195,247,0.35); }
        100% { background-color: rgba(79,195,247,0.15); }
      }

      th.__resizable { position: sticky; top: 0; z-index: 2; }
      .__resize-handle {
        position: absolute;
        top: 0;
        right: 0;
        width: 10px;
        height: 100%;
        cursor: col-resize;
        user-select: none;
      }
      .__resize-handle:hover { background: rgba(255, 255, 255, 0.08); }
    `;
    document.head.appendChild(style);
    done = true;
  };
})();

function MonitorDetailAdvanced() {
  injectOnce();

  const [searchParams] = useSearchParams();

  // ✅ URL 파라미터 → 상태 초기화
  const [from, setFrom] = useState(() =>
    toLocalInput(searchParams.get("from"))
  );
  const [to, setTo] = useState(() => toLocalInput(searchParams.get("to")));
  const [artist, setArtist] = useState(() =>
    (searchParams.get("artist") || "").trim()
  );
  const [lightstick, setLightstick] = useState(() =>
    (searchParams.get("lightstick") || "").trim()
  );
  const [serialParam, setSerialParam] = useState(() =>
    (searchParams.get("serial") || "").trim()
  );
  const [macParam, setMacParam] = useState(() =>
    (searchParams.get("mac") || "").trim()
  );

  const [query, setQuery] = useState(""); // 상단 검색창(로케이트용)
  const [activeTab, setActiveTab] = useState(TABS[0].key);

  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const tableScrollRef = useRef(null);
  const rowRefs = useRef({});
  const [appliedQuery, setAppliedQuery] = useState(""); // 셀 하이라이트용(필터X)
  const [pendingScrollToIndex, setPendingScrollToIndex] = useState(null); // 페이지 내부 0-based

  // ✅ 탭별 가시 컬럼: COLUMNS ∩ HEADERS
  const visibleColumns = useMemo(() => {
    const byTab = COLUMNS[activeTab] || [];
    return byTab.filter((c) => HEADERS[c]);
  }, [activeTab]);

  // ✅ 탭별 컬럼 폭(드래그 리사이즈) 저장
  const [colWidthsByTab, setColWidthsByTab] = useState(() => ({}));

  const getColWidth = (tabKey, col) =>
    colWidthsByTab?.[tabKey]?.[col] ?? COL_MIN_WIDTH[col] ?? 100;

  const setColWidth = (tabKey, col, width) => {
    setColWidthsByTab((prev) => ({
      ...prev,
      [tabKey]: {
        ...(prev[tabKey] || {}),
        [col]: width,
      },
    }));
  };

  const startResize = (e, col) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startW = getColWidth(activeTab, col);
    const minW = 100;

    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    const onMove = (ev) => {
      const next = Math.max(minW, startW + (ev.clientX - startX));
      setColWidth(activeTab, col, next);
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = prevUserSelect;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ✅ 데이터 가져오기
  const fetchData = async ({ pageArg = page, sizeArg = pageSize } = {}) => {
    setIsLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("type", String(activeTab));
      qs.set("page", String(pageArg));
      qs.set("page_size", String(sizeArg));
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);

      if (artist) qs.set("artist", artist);
      if (lightstick) qs.set("lightstick", lightstick);
      if (serialParam) qs.set("serial", serialParam);
      if (macParam) qs.set("mac", macParam);

      const res = await fetch(
        `${SERVER_ADDRESS}/api/monitor/detail/advanced?${qs.toString()}`,
        { credentials: "include" }
      );
      const data = await res.json();

      if (data.success) {
        setRows(data.data || []);
        setPage(Number(data.page) || pageArg);

        if (typeof data.totalPages === "number") {
          setTotalPages(data.totalPages);
        } else if (typeof data.total === "number") {
          const ps = Number(data.pageSize) || sizeArg;
          setTotalPages(Math.max(1, Math.ceil(data.total / ps)));
        } else {
          setTotalPages(1);
        }
      } else {
        setRows([]);
        setTotalPages(1);
      }
    } catch (err) {
      console.error("fetchData error:", err);
      setRows([]);
      setTotalPages(1);
    } finally {
      setIsLoading(false);
    }
  };

  // URL 파라미터 변경시 동기화
  useEffect(() => {
    const spFrom = toLocalInput(searchParams.get("from"));
    const spTo = toLocalInput(searchParams.get("to"));
    const spArtist = (searchParams.get("artist") || "").trim();
    const spLightstick = (searchParams.get("lightstick") || "").trim();
    const spSerial = (searchParams.get("serial") || "").trim();
    const spMac = (searchParams.get("mac") || "").trim();

    if (spFrom !== from) setFrom(spFrom);
    if (spTo !== to) setTo(spTo);
    if (spArtist !== artist) setArtist(spArtist);
    if (spLightstick !== lightstick) setLightstick(spLightstick);
    if (spSerial !== serialParam) setSerialParam(spSerial);
    if (spMac !== macParam) setMacParam(spMac);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // 탭/필터 변경 시 1페이지부터 로드
  useEffect(() => {
    setPage(1);
    fetchData({ pageArg: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, from, to, artist, lightstick, serialParam, macParam]);

  // rows 로드 후 pendingScrollToIndex가 있으면 스크롤/하이라이트
  useEffect(() => {
    if (pendingScrollToIndex == null) return;
    const rowEl = rowRefs.current[pendingScrollToIndex];
    if (!rowEl) return;

    const container = tableScrollRef.current;
    if (container) {
      const top =
        rowEl.offsetTop - container.clientHeight / 2 + rowEl.clientHeight / 2;
      container.scrollTo({ top, behavior: "smooth" });
    } else {
      rowEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    rowEl.classList.add("highlight-pulse");
    const t = setTimeout(() => rowEl.classList.remove("highlight-pulse"), 1800);
    setPendingScrollToIndex(null);
    return () => clearTimeout(t);
  }, [rows, pendingScrollToIndex]);

  // locate → 페이지 이동 + 스크롤/하이라이트
  const locateAndGo = async (keyword) => {
    const q = (keyword ?? "").trim();
    setAppliedQuery(q);

    if (!q) {
      setPendingScrollToIndex(null);
      setPage(1);
      await fetchData({ pageArg: 1 });
      return;
    }

    const qs = new URLSearchParams();
    qs.set("type", activeTab);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (artist) qs.set("artist", artist);
    if (lightstick) qs.set("lightstick", lightstick);
    if (serialParam) qs.set("serial", serialParam);
    if (macParam) qs.set("mac", macParam);
    qs.set("q", q);

    const url = `${SERVER_ADDRESS}/api/monitor/detail/advanced/locate?${qs.toString()}`;

    let locateResult = null;
    try {
      const r = await fetch(url, { credentials: "include" });
      const j = await r.json();
      if (j?.success) locateResult = j;
    } catch (_) {}

    if (
      !locateResult ||
      typeof locateResult.index !== "number" ||
      locateResult.index < 0
    ) {
      setPendingScrollToIndex(null);
      setPage(1);
      await fetchData({ pageArg: 1 });
      return;
    }

    const globalIndex = locateResult.index; // 0-based
    const targetPage = Math.floor(globalIndex / pageSize) + 1;
    const indexInPage = globalIndex % pageSize;

    setPendingScrollToIndex(indexInPage);
    setPage(targetPage);
    await fetchData({ pageArg: targetPage });
  };

  const handleApplyFilter = () => locateAndGo(query);

  const goPrev = () => page > 1 && fetchData({ pageArg: page - 1 });
  const goNext = () => page < totalPages && fetchData({ pageArg: page + 1 });

  const getPageNumbers = () => {
    const delta = 5;
    const range = [];
    const start = Math.max(2, page - delta);
    const end = Math.min(totalPages - 1, page + delta);

    range.push(1);
    if (start > 2) range.push("...");
    for (let i = start; i <= end; i++) range.push(i);
    if (end < totalPages - 1) range.push("...");
    if (totalPages > 1) range.push(totalPages);

    return range;
  };

  const renderCellValue = (col, value) => {
    if (value == null) return "";
    // ✅ cartonbox src 배지 (1=LOG, 2=EXCEPTION)
    if (col === "src") {
      const n = Number(value);
      const label = n === 2 ? "EXCEPTION" : "LOG";
      const bg = n === 2 ? "#ef4444" : "#22c55e";

      return (
        <span
          style={{
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: 12,
            background: bg,
            color: "#000",
            fontWeight: 700,
            fontSize: "0.75rem",
          }}
        >
          {label}
        </span>
      );
    }
    if (col === "box_count" || col === "box_total_count") {
      return Number.isFinite(Number(value)) ? String(value) : "";
    }

    if (
      col === "created_at" ||
      col === "updated_at" ||
      col === "printed_at" ||
      col === "factory_date"
    ) {
      const d = dayjs(value);
      return d.isValid() ? d.format("YY/MM/DD HH:mm:ss") : String(value);
    }

    if (col === "result") {
      const v = String(value).toUpperCase();
      const bg =
        v === "PASS"
          ? "#22c55e"
          : v === "FAIL"
          ? "#ef4444"
          : v.includes("DUP")
          ? "#f59e0b"
          : "#6b7280";

      return (
        <span
          style={{
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: 12,
            background: bg,
            color: "#000",
            fontWeight: 700,
            fontSize: "0.75rem",
          }}
        >
          {v}
        </span>
      );
    }

    return String(value);
  };

  const renderCell = (col, value) => {
    const base = renderCellValue(col, value);

    // 배지(React 엘리먼트)는 하이라이트 적용 X
    if (!appliedQuery || typeof base !== "string") return base;

    const text = base;
    if (!text) return base;

    try {
      const esc = appliedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(${esc})`, "gi");
      const parts = text.split(re);
      return (
        <>
          {parts.map((p, idx) =>
            re.test(p) ? (
              <mark key={idx} className="__mes">
                {p}
              </mark>
            ) : (
              <span key={idx}>{p}</span>
            )
          )}
        </>
      );
    } catch {
      return base;
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: 20,
        backgroundColor: "#1e1e2f",
        minHeight: "100vh",
        color: "#fff",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <h2 style={{ color: "#4fc3f7", marginBottom: 12 }}>이력 조회</h2>

      {/* 필터 바 */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          backgroundColor: "#2b2b40",
          padding: "12px 16px",
          borderRadius: 8,
          marginBottom: 12,
        }}
      >
        <div>
          <label style={{ marginRight: 6 }}>From</label>
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            style={{
              backgroundColor: "#1e1e2f",
              color: "#fff",
              border: "1px solid #555",
              padding: "4px 8px",
              borderRadius: 4,
            }}
          />
        </div>
        <div>
          <label style={{ marginRight: 6 }}>To</label>
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={{
              backgroundColor: "#1e1e2f",
              color: "#fff",
              border: "1px solid #555",
              padding: "4px 8px",
              borderRadius: 4,
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label>페이지 크기</label>
          <select
            value={pageSize}
            onChange={async (e) => {
              const size = Number(e.target.value);
              setPageSize(size);
              setPage(1);

              // 검색 중이면 위치 유지(동일 키워드로 locate)
              if (appliedQuery) await locateAndGo(appliedQuery);
              else await fetchData({ pageArg: 1, sizeArg: size });
            }}
            style={{
              backgroundColor: "#1e1e2f",
              color: "#fff",
              border: "1px solid #555",
              padding: "4px 8px",
              borderRadius: 4,
            }}
          >
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flex: "1 0 240px",
          }}
        >
          <input
            placeholder="MAC, 시리얼 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleApplyFilter();
            }}
            style={{
              width: "100%",
              backgroundColor: "#1e1e2f",
              color: "#fff",
              border: "1px solid #555",
              padding: "6px 8px",
              borderRadius: 4,
            }}
          />
        </div>

        <button
          onClick={handleApplyFilter}
          style={{
            padding: "6px 12px",
            fontSize: 14,
            backgroundColor: "#4fc3f7",
            color: "#000",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          검색
        </button>
      </div>

      {/* 탭 */}
      <div
        style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "8px 12px",
              backgroundColor: activeTab === tab.key ? "#4fc3f7" : "#2b2b40",
              color: activeTab === tab.key ? "#000" : "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 테이블 */}
      <div
        ref={tableScrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "auto",
          backgroundColor: "#2b2b40",
          borderRadius: 8,
          maxHeight: "calc(100vh - 220px)",
        }}
      >
        {isLoading ? (
          <div style={{ padding: 16 }}>로딩 중...</div>
        ) : (
          <table
            style={{
              borderCollapse: "collapse",
              tableLayout: "fixed",
              width: "max-content", // ✅ 컬럼 폭 합만큼 테이블이 늘어나게
              minWidth: "100%", // ✅ 화면보다 작으면 꽉 채움
            }}
          >
            <colgroup>
              <col style={{ width: 60 }} /> {/* 번호 */}
              {visibleColumns.map((col) => (
                <col key={col} style={{ width: getColWidth(activeTab, col) }} />
              ))}
            </colgroup>

            <thead>
              <tr>
                <th
                  style={{
                    borderBottom: "1px solid #444",
                    padding: "8px",
                    backgroundColor: "#2b2b40",
                    color: "#ffca28",
                    textAlign: "center",
                    fontSize: "0.85rem",
                    position: "sticky",
                    top: 0,
                    zIndex: 3,
                    whiteSpace: "nowrap",
                    width: 60,
                  }}
                >
                  번호
                </th>

                {visibleColumns.map((col) => (
                  <th
                    key={col}
                    className="__resizable"
                    style={{
                      borderBottom: "1px solid #444",
                      padding: "8px",
                      backgroundColor: "#2b2b40",
                      color: "#ffca28",
                      textAlign: "left",
                      fontSize: "0.85rem",
                      position: "sticky",
                      top: 0,
                      zIndex: 2,
                      whiteSpace: "nowrap",
                    }}
                    title={HEADERS[col]}
                  >
                    <div style={{ position: "relative", paddingRight: 12 }}>
                      {HEADERS[col]}
                      <span
                        className="__resize-handle"
                        onMouseDown={(e) => startResize(e, col)}
                        title="드래그해서 폭 조절"
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={visibleColumns.length + 1}
                    style={{ padding: 16, textAlign: "center" }}
                  >
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i} ref={(el) => (rowRefs.current[i] = el)}>
                    <td
                      style={{
                        borderBottom: "1px solid #333",
                        padding: "6px 8px",
                        fontSize: "0.85rem",
                        textAlign: "center",
                        color: "#aaa",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {(page - 1) * pageSize + i + 1}
                    </td>

                    {visibleColumns.map((col) => {
                      const rawTitle = renderCellValue(col, r[col]);
                      const title =
                        typeof rawTitle === "string" ? rawTitle : "";

                      return (
                        <td
                          key={col}
                          style={{
                            borderBottom: "1px solid #333",
                            padding: "6px 8px",
                            fontSize: "0.85rem",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={title || ""}
                        >
                          {renderCell(col, r[col])}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* 페이지네이션 */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          marginTop: 12,
          background: "#1e1e2f",
          paddingTop: 8,
          paddingBottom: 8,
          display: "flex",
          gap: 8,
          alignItems: "center",
          borderTop: "1px solid #333",
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={goPrev}
          disabled={page <= 1}
          style={{
            padding: "6px 10px",
            borderRadius: 4,
            border: "1px solid #444",
            background: "#2b2b40",
            color: "#fff",
            cursor: page <= 1 ? "not-allowed" : "pointer",
          }}
        >
          ◀ 이전
        </button>

        {getPageNumbers().map((num, idx) =>
          num === "..." ? (
            <span key={`ellipsis-${idx}`} style={{ color: "#888" }}>
              …
            </span>
          ) : (
            <button
              key={num}
              onClick={() => fetchData({ pageArg: num })}
              style={{
                padding: "6px 10px",
                borderRadius: 4,
                border: "1px solid #444",
                background: num === page ? "#4fc3f7" : "#2b2b40",
                color: num === page ? "#000" : "#fff",
                fontWeight: num === page ? "bold" : "normal",
                cursor: "pointer",
              }}
            >
              {num}
            </button>
          )
        )}

        <button
          onClick={goNext}
          disabled={page >= totalPages}
          style={{
            padding: "6px 10px",
            borderRadius: 4,
            border: "1px solid #444",
            background: "#2b2b40",
            color: "#fff",
            cursor: page >= totalPages ? "not-allowed" : "pointer",
          }}
        >
          다음 ▶
        </button>
      </div>
    </div>
  );
}

export default MonitorDetailAdvanced;
