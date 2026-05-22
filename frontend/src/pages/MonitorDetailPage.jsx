import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import SERVER_ADDRESS from "../config";
import dayjs from "dayjs";

const TABS = [
  { key: "mac_write", label: "MAC WRITE" },
  { key: "compare", label: "MAC COMPARE" },
  { key: "device_print", label: "DEVICE PRINT" },
  { key: "giftbox_print", label: "GIFTBOX PRINT" },
  { key: "cartonbox_print", label: "CARTONBOX PRINT" },
];

// 탭별 표시 컬럼
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

// 컬럼 → 한글 헤더
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

// ✅ 모든 컬럼 최소 폭: 100
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

// 하이라이트 CSS 1회 주입 (+ 리사이즈 핸들 CSS)
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

      /* ✅ 헤더 리사이즈 핸들 */
      th.__resizable {
        position: sticky;
        top: 0;
        z-index: 2;
      }
      .__resize-handle {
        position: absolute;
        top: 0;
        right: 0;
        width: 10px;
        height: 100%;
        cursor: col-resize;
        user-select: none;
      }
      .__resize-handle:hover {
        background: rgba(255, 255, 255, 0.08);
      }
    `;
    document.head.appendChild(style);
    done = true;
  };
})();

export default function MonitorDetailPage() {
  injectOnce();

  const { generatorName } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  // 기간
  const defaultFrom = dayjs().startOf("day").format("YYYY-MM-DDTHH:mm");
  const defaultTo = dayjs().format("YYYY-MM-DDTHH:mm");
  const [from, setFrom] = useState(searchParams.get("from") || defaultFrom);
  const [to, setTo] = useState(searchParams.get("to") || defaultTo);

  // 상태
  const [activeTab, setActiveTab] = useState("mac_write");
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // 페이징
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // 검색
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState(""); // 셀 하이라이트용(필터X)

  const columns = useMemo(() => COLUMNS[activeTab] || [], [activeTab]);

  // 행 참조 + 스크롤
  const rowRefs = useRef({});
  const [pendingScrollToIndex, setPendingScrollToIndex] = useState(null);
  const tableScrollRef = useRef(null);

  // ✅ 탭별 컬럼 폭(드래그 리사이즈) 저장
  const [colWidthsByTab, setColWidthsByTab] = useState(() => ({}));

  // 현재 탭의 컬럼 폭 가져오기
  const getColWidth = (tabKey, col) =>
    colWidthsByTab?.[tabKey]?.[col] ?? COL_MIN_WIDTH[col] ?? 100;

  // 현재 탭의 컬럼 폭 설정
  const setColWidth = (tabKey, col, width) => {
    setColWidthsByTab((prev) => ({
      ...prev,
      [tabKey]: {
        ...(prev[tabKey] || {}),
        [col]: width,
      },
    }));
  };

  // ✅ 드래그 리사이즈 시작
  const startResize = (e, col) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startW = getColWidth(activeTab, col);
    const minW = 100; // ✅ 요구사항: Min 100

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

  // 값 렌더링(날짜/배지)
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

  // 셀 내부 검색어 하이라이트
  const renderCell = (col, value) => {
    const base = renderCellValue(col, value);

    // 배지(React 엘리먼트) 같은 비-문자열은 하이라이트 적용 X
    if (!appliedQuery || typeof base !== "string") return base;

    const text = base;
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

  // 데이터 조회
  const fetchData = async ({
    pageArg = page,
    sizeArg = pageSize,
    qArg = appliedQuery,
    applyFilter = true,
  } = {}) => {
    setIsLoading(true);
    try {
      const qs = new URLSearchParams({
        type: activeTab,
        generator_name: generatorName,
        from,
        to,
        page: String(pageArg),
        page_size: String(sizeArg),
      });
      if (applyFilter && qArg) qs.set("q", qArg);

      const res = await fetch(
        `${SERVER_ADDRESS}/api/monitor/detail?${qs.toString()}`,
        { credentials: "include" }
      );
      const result = await res.json();

      if (result.success) {
        setRows(result.data || []);
        setTotal(result.total || 0);
        setPage(result.page || pageArg);
      } else {
        console.error("API 오류:", result.message);
        setRows([]);
        setTotal(0);
      }
    } catch (e) {
      console.error("데이터 요청 실패:", e);
      setRows([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  };

  // URL에 기간 동기화
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set("from", from);
    next.set("to", to);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  // 탭 변경 시
  useEffect(() => {
    setPage(1);
    fetchData({ pageArg: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // 기간 변경 시
  useEffect(() => {
    setPage(1);
    fetchData({ pageArg: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  // 페이지 버튼(앞뒤 5)
  const getPageNumbers = () => {
    const nums = [];
    const start = Math.max(1, page - 5);
    const end = Math.min(totalPages, page + 5);
    if (start > 1) {
      nums.push(1);
      if (start > 2) nums.push("...");
    }
    for (let i = start; i <= end; i++) nums.push(i);
    if (end < totalPages) {
      if (end < totalPages - 1) nums.push("...");
      nums.push(totalPages);
    }
    return nums;
  };

  // 찾기 → locate → 해당 페이지 로드 → 스크롤/하이라이트
  const locateAndGo = async (keyword) => {
    const q = (keyword ?? "").trim();
    setAppliedQuery(q);

    if (!q) {
      setPage(1);
      await fetchData({ pageArg: 1, qArg: "", applyFilter: false });
      setPendingScrollToIndex(null);
      return;
    }

    const qs = new URLSearchParams({
      type: activeTab,
      generator_name: generatorName,
      from,
      to,
      q,
    });

    const res = await fetch(
      `${SERVER_ADDRESS}/api/monitor/detail/locate?${qs.toString()}`,
      { credentials: "include" }
    );
    const result = await res.json();

    if (
      !result.success ||
      typeof result.index !== "number" ||
      result.index < 0
    ) {
      setPage(1);
      await fetchData({ pageArg: 1, qArg: "", applyFilter: false });
      setPendingScrollToIndex(null);
      return;
    }

    const targetPage = Math.floor(result.index / pageSize) + 1;
    const indexInPage = result.index % pageSize;

    setPendingScrollToIndex(indexInPage);
    await fetchData({ pageArg: targetPage, qArg: "", applyFilter: false });
  };

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

  const handleApplyFilter = () => locateAndGo(query);

  const goPrev = () => page > 1 && fetchData({ pageArg: page - 1 });
  const goNext = () => page < totalPages && fetchData({ pageArg: page + 1 });

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
      <h2 style={{ color: "#4fc3f7", marginBottom: 12 }}>
        {generatorName} 상세 이력
      </h2>

      {/* 필터/검색 바 */}
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
              if (appliedQuery) await locateAndGo(appliedQuery);
              else {
                setPage(1);
                fetchData({ pageArg: 1, sizeArg: size });
              }
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

      {/* 테이블 스크롤 영역 (가로/세로 스크롤) */}
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
              width: "max-content", // ✅ 핵심: 컬럼 폭 합만큼 늘어나게
              minWidth: "100%", // ✅ 화면보다 작으면 꽉 채움
            }}
          >
            <colgroup>
              <col style={{ width: 60 }} /> {/* 번호 */}
              {columns.map((col) => (
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

                {columns.map((col) => (
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
                      whiteSpace: "nowrap",
                      zIndex: 2,
                    }}
                    title={HEADERS[col] || col}
                  >
                    <div style={{ position: "relative", paddingRight: 12 }}>
                      {HEADERS[col] || col}
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
                    colSpan={columns.length + 1}
                    style={{ padding: 16, textAlign: "center" }}
                  >
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr
                    key={i}
                    ref={(el) => {
                      rowRefs.current[i] = el;
                    }}
                  >
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

                    {columns.map((col) => {
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
