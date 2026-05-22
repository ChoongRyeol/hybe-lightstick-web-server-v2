// src/pages/MonitorDetailUnifiedBackup.jsx
// - 검색: locate 제거, "검색 결과만" 리스트 표시 (q 필터)
// - 검색/결과필터: 탭별로 독립 유지 (result_{tab}, q_{tab})
// - 검색 적용 상태면: 페이지 이동/기간 변경/탭 이동/페이지크기 변경에도 검색+필터가 항상 함께 적용
// - 리스트만 스크롤, 페이지네이션은 하단 고정(스크롤 영향 X)
// - ✅ DEVICE/GIFTBOX: model/device_name 표시 제거
// - ✅ CARTONBOX: 구분(src), 박스번호(box_count) 필터 적용
// - ✅ CSV Export 추가: 현재 날짜/탭/검색/필터 조건 전체 export

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import SERVER_ADDRESS from "../config";
import ResultFilter from "../components/ResultFilter";
import { FILTER, mergeStyle } from "../components/FilterBarStyles";
import dayjs from "dayjs";

const TABS = [
  { key: "firmware_download", label: "F/W DOWNLOAD" },
  { key: "mac_write", label: "MAC WRITE" },
  { key: "compare", label: "COMPARE" },
  { key: "device_print", label: "DEVICE PRINT" },
  { key: "giftbox_print", label: "GIFTBOX PRINT" },
  { key: "cartonbox_print", label: "CARTONBOX PRINT" },
];

// ✅ v2 엔드포인트(탭별로 완전 분리)
const V2 = {
  firmware_download: {
    list: "/api/backup/monitor/v2/firmware-download",
    supportsResult: true,
  },
  mac_write: {
    list: "/api/backup/monitor/v2/mac-write",
    supportsResult: true,
  },
  compare: {
    list: "/api/backup/monitor/v2/compare",
    supportsResult: true,
  },
  device_print: {
    list: "/api/backup/monitor/v2/device-print",
    supportsResult: false,
  },
  giftbox_print: {
    list: "/api/backup/monitor/v2/giftbox-print",
    supportsResult: false,
  },
  cartonbox_print: {
    list: "/api/backup/monitor/v2/cartonbox-print",
    supportsResult: false,
  },
};

// ✅ 탭별 표시 컬럼(실제 스키마 기준)
const COLUMNS = {
  firmware_download: [
    "result",
    "line",
    "created_at",
    "generator_name",
    "artist",
    "lightstick",
    "serial",
    "device_guid",
    "board_name",
    "row_id",
    "evk_time",
    "write_check",

    "disable_protect_flash_r",
    "disable_protect_flash_v",
    "erase_firmware_k_r",
    "erase_firmware_k_v",
    "calib_fre_offset_2498mhz_hz_r",
    "calib_fre_offset_2498mhz_hz_v",
    "tx_cnt_2498mhz_r",
    "tx_cnt_2498mhz_v",
    "rx_cnt_2498mhz_r",
    "rx_cnt_2498mhz_v",
    "tx_power_2498mhz_db_r",
    "tx_power_2498mhz_db_v",
    "rx_power_2498mhz_r",
    "rx_power_2498mhz_v",
    "calib_fre_offset_2398mhz_hz_r",
    "calib_fre_offset_2398mhz_hz_v",
    "tx_cnt_2398mhz_r",
    "tx_cnt_2398mhz_v",
    "rx_cnt_2398mhz_r",
    "rx_cnt_2398mhz_v",
    "tx_power_2398mhz_db_r",
    "tx_power_2398mhz_db_v",
    "rx_power_2398mhz_r",
    "rx_power_2398mhz_v",
    "erase_mac_k_r",
    "erase_mac_k_v",
    "write_firmware_err_addr_r",
    "write_firmware_err_addr_v",
    "write_mac_hb_r",
    "write_mac_hb_v",
    "write_mac_lb_r",
    "write_mac_lb_v",
    "write_freoffset_r",
    "write_freoffset_v",
    "check_firmware_err_addr_r",
    "check_firmware_err_addr_v",
    "check_mac_lb_r",
    "check_mac_lb_v",
    "read_mac_lb_value_r",
    "read_mac_lb_value_v",
    "check_freoffset_r",
    "check_freoffset_v",
  ],
  mac_write: [
    "result",
    "line",
    "created_at",
    "updated_at",
    "serial",
    "rssi",
    "high_current",
    "high_current_result",
    "low_current",
    "low_current_result",
    "mac_address",
    "description",
    "artist",
    "lightstick",
    "fw_version",
    "device_name",
    "generator_name",
    "device_guid",
  ],
  compare: [
    "result",
    "line",
    "created_at",
    "updated_at",
    "serial",
    "mac_address",
    "description",
    "artist",
    "lightstick",
    "fw_version",
    "device_name",
    "generator_name",
  ],

  // ✅ model/device_name 제거
  device_print: [
    "line",
    "printed_at",
    "updated_at",
    "serial",
    "mac_address",
    "artist",
    "lightstick",
    "certification_info",
    "user_id",
    "user_name",
    "generator_name",
  ],

  // ✅ model/device_name 제거
  giftbox_print: [
    "line",
    "printed_at",
    "updated_at",
    "serial",
    "mac_address",
    "artist",
    "lightstick",
    "certification_info",
    "user_id",
    "user_name",
    "generator_name",
  ],

  cartonbox_print: [
    "src",
    "line",
    "printed_at",
    "updated_at",
    "box_count",
    "box_total_count",
    "description",
    "serial",
    "mac_address",
    "artist",
    "lightstick",
    "model",
    "factory_date",
    "device_name",
    "generator_name",
    "user_id",
    "user_name",
  ],
};

// 컬럼 → 한글 헤더
const HEADERS = {
  line: "라인",
  created_at: "작업일",
  updated_at: "작업일(수정)",
  printed_at: "출력시간",
  generator_name: "생산관리명",
  artist: "아티스트",
  lightstick: "응원봉",
  serial: "시리얼",
  rssi: "RSSI",
  high_current: "고휘도 전류",
  high_current_result: "고휘도 결과",

  low_current: "저휘도 전류",
  low_current_result: "저휘도 결과",
  device_guid: "U/N",
  mac_address: "MAC",
  fw_version: "FW 버전",
  device_name: "디바이스",
  result: "결과",
  src: "구분",
  description: "설명",
  certification_info: "인증",
  user_id: "작업자ID",
  user_name: "작업자명",
  model: "모델",
  factory_date: "제조일",
  box_count: "박스 번호",
  box_total_count: "총 박스 수",
  device_guid: "UN",
  board_name: "보드",
  row_id: "Row ID",
  evk_time: "EVK 시간",
  write_check: "저장체크",

  disable_protect_flash_r: "DisableProtect 결과",
  disable_protect_flash_v: "DisableProtect 값",
  erase_firmware_k_r: "Erase FW 결과",
  erase_firmware_k_v: "Erase FW 값",
  calib_fre_offset_2498mhz_hz_r: "2498 Offset 결과",
  calib_fre_offset_2498mhz_hz_v: "2498 Offset 값",
  tx_cnt_2498mhz_r: "2498 TX CNT 결과",
  tx_cnt_2498mhz_v: "2498 TX CNT 값",
  rx_cnt_2498mhz_r: "2498 RX CNT 결과",
  rx_cnt_2498mhz_v: "2498 RX CNT 값",
  tx_power_2498mhz_db_r: "2498 TX Power 결과",
  tx_power_2498mhz_db_v: "2498 TX Power 값",
  rx_power_2498mhz_r: "2498 RX Power 결과",
  rx_power_2498mhz_v: "2498 RX Power 값",
  calib_fre_offset_2398mhz_hz_r: "2398 Offset 결과",
  calib_fre_offset_2398mhz_hz_v: "2398 Offset 값",
  tx_cnt_2398mhz_r: "2398 TX CNT 결과",
  tx_cnt_2398mhz_v: "2398 TX CNT 값",
  rx_cnt_2398mhz_r: "2398 RX CNT 결과",
  rx_cnt_2398mhz_v: "2398 RX CNT 값",
  tx_power_2398mhz_db_r: "2398 TX Power 결과",
  tx_power_2398mhz_db_v: "2398 TX Power 값",
  rx_power_2398mhz_r: "2398 RX Power 결과",
  rx_power_2398mhz_v: "2398 RX Power 값",
  erase_mac_k_r: "Erase MAC 결과",
  erase_mac_k_v: "Erase MAC 값",
  write_firmware_err_addr_r: "Write FW 결과",
  write_firmware_err_addr_v: "Write FW 값",
  write_mac_hb_r: "Write MAC HB 결과",
  write_mac_hb_v: "Write MAC HB 값",
  write_mac_lb_r: "Write MAC LB 결과",
  write_mac_lb_v: "Write MAC LB 값",
  write_freoffset_r: "Write Offset 결과",
  write_freoffset_v: "Write Offset 값",
  check_firmware_err_addr_r: "Check FW 결과",
  check_firmware_err_addr_v: "Check FW 값",
  check_mac_lb_r: "Check MAC LB 결과",
  check_mac_lb_v: "Check MAC LB 값",
  read_mac_lb_value_r: "Read MAC LB 결과",
  read_mac_lb_value_v: "Read MAC LB 값",
  check_freoffset_r: "Check Offset 결과",
  check_freoffset_v: "Check Offset 값",
};

// ✅ 모든 컬럼 최소 폭: 100
const COL_MIN_WIDTH = Object.keys(HEADERS).reduce((acc, k) => {
  acc[k] = 100;
  return acc;
}, {});

// CSV 유틸
const escapeCsv = (value) => {
  if (value == null) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
};

const formatCsvValue = (col, value) => {
  if (value == null) return "";

  if (
    col === "created_at" ||
    col === "updated_at" ||
    col === "printed_at" ||
    col === "factory_date"
  ) {
    const d = dayjs(value);
    return d.isValid() ? d.format("YYYY-MM-DD HH:mm:ss") : String(value);
  }

  if (col === "src") {
    const raw = String(value).toUpperCase();
    return raw === "EXCEPTION" || raw === "2" ? "EXCEPTION" : "LOG";
  }

  if (col === "result") {
    return String(value).toUpperCase();
  }

  if (col === "box_count" || col === "box_total_count") {
    return Number.isFinite(Number(value)) ? String(value) : "";
  }

  return String(value);
};

const downloadCsvFile = (filename, csvText) => {
  const blob = new Blob(["\ufeff" + csvText], {
    type: "text/csv;charset=utf-8;",
  });

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};

// 하이라이트 CSS 1회 주입 (+ 리사이즈 핸들 CSS)
const injectOnce = (() => {
  let done = false;
  return () => {
    if (done) return;
    const style = document.createElement("style");
    style.innerHTML = `
      mark.__mes { background: #ffe08a; padding: 0 2px; border-radius: 3px; }

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

export default function MonitorDetailUnifiedBackup() {
  injectOnce();

  const { generatorName: generatorNameParam } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const generatorNameQuery = searchParams.get("generator_name") || "";
  const generatorName = (generatorNameParam || generatorNameQuery || "").trim();

  // 기간
  const defaultFrom = dayjs().startOf("day").format("YYYY-MM-DDTHH:mm");
  const defaultTo = dayjs().format("YYYY-MM-DDTHH:mm");
  const [from, setFrom] = useState(searchParams.get("from") || defaultFrom);
  const [to, setTo] = useState(searchParams.get("to") || defaultTo);

  // 탭
  const [activeTab, setActiveTab] = useState(
    searchParams.get("type") || "mac_write",
  );

  // ✅ 탭별 검색 입력/적용 상태
  const [queryInputByTab, setQueryInputByTab] = useState(() => ({}));
  const [queryAppliedByTab, setQueryAppliedByTab] = useState(() => ({}));

  const queryInput = queryInputByTab[activeTab] ?? "";
  const queryApplied = queryAppliedByTab[activeTab] ?? "";

  // 상태
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // 페이징
  const [page, setPage] = useState(Number(searchParams.get("page") || 1));
  const [pageSize, setPageSize] = useState(
    Number(searchParams.get("page_size") || 50),
  );
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // ✅ Result 필터(탭별 저장): mac_write, compare만 사용
  const tabMeta = V2[activeTab] || V2.mac_write;
  const resultKey = `result_${activeTab}`;
  const [resultFilter, setResultFilter] = useState(
    searchParams.get(resultKey) || "",
  );

  // ✅ CARTONBOX 전용 필터 (URL 유지)
  const [cartonSrc, setCartonSrc] = useState(searchParams.get("src") || "");
  const [cartonBoxCount, setCartonBoxCount] = useState(
    searchParams.get("box_count") || "",
  );

  const columns = useMemo(() => COLUMNS[activeTab] || [], [activeTab]);

  const tableScrollRef = useRef(null);

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

  // ✅ 드래그 리사이즈 시작
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

  // 값 렌더링(날짜/배지)
  const renderCellValue = (col, value) => {
    if (value == null) return "";

    // cartonbox src 배지
    if (col === "src") {
      const raw = String(value).toUpperCase();
      const isEx = raw === "EXCEPTION" || raw === "2";
      const label = isEx ? "EXCEPTION" : "LOG";
      const bg = isEx ? "#ef4444" : "#22c55e";

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
    if (col === "device_guid") {
      // mysql2 Buffer 객체 대응
      if (
        value &&
        typeof value === "object" &&
        value.type === "Buffer" &&
        Array.isArray(value.data)
      ) {
        return value.data
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
          .toUpperCase();
      }

      return String(value || "");
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
    if (!queryApplied || typeof base !== "string") return base;

    const text = base;
    try {
      const esc = queryApplied.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
            ),
          )}
        </>
      );
    } catch {
      return base;
    }
  };

  // ✅ v2 목록 조회
  const fetchData = async ({
    pageArg = page,
    sizeArg = pageSize,
    resultOverride,
    qOverride,
    srcOverride,
    boxOverride,
  } = {}) => {
    setIsLoading(true);
    try {
      const qs = new URLSearchParams({
        from,
        to,
        page: String(pageArg),
        page_size: String(sizeArg),
      });

      if (generatorName) qs.set("generator_name", generatorName);

      const qApplied =
        qOverride !== undefined
          ? String(qOverride || "").trim()
          : String(queryAppliedByTab[activeTab] || "").trim();

      if (qApplied) qs.set("q", qApplied);

      if (tabMeta.supportsResult) {
        const rf = String(
          resultOverride !== undefined ? resultOverride : resultFilter || "",
        )
          .trim()
          .toUpperCase();
        if (rf) qs.set("result", rf);
      }

      if (activeTab === "cartonbox_print") {
        const src =
          srcOverride !== undefined ? String(srcOverride || "") : cartonSrc;
        const box =
          boxOverride !== undefined
            ? String(boxOverride || "")
            : cartonBoxCount;

        const srcV = String(src || "")
          .trim()
          .toUpperCase();
        const boxV = String(box || "").trim();

        if (srcV) qs.set("src", srcV);
        if (boxV) qs.set("box_count", boxV);
      }

      const url = `${SERVER_ADDRESS}${tabMeta.list}?${qs.toString()}`;
      const res = await fetch(url, { credentials: "include" });

      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        const text = await res.text();
        console.error(
          "[MonitorDetailUnified] Non-JSON:",
          res.status,
          ct,
          text.slice(0, 200),
        );
        setRows([]);
        setTotal(0);
        setPage(pageArg);
        return;
      }

      const result = await res.json();

      if (result.success) {
        setRows(result.data || []);
        setTotal(result.total || 0);
        setPage(result.page || pageArg);

        if (tableScrollRef.current) {
          tableScrollRef.current.scrollTop = 0;
        }
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

  // ✅ CSV Export
  const handleExportCsv = async () => {
    try {
      setIsLoading(true);

      const exportPageSize = 1000;
      let currentPage = 1;
      let exportRows = [];
      let exportTotalPages = 1;

      while (true) {
        const qs = new URLSearchParams({
          from,
          to,
          page: String(currentPage),
          page_size: String(exportPageSize),
        });

        if (generatorName) qs.set("generator_name", generatorName);

        // 현재 탭 검색어
        const qApplied = String(queryAppliedByTab[activeTab] || "").trim();
        if (qApplied) qs.set("q", qApplied);

        // 현재 결과 필터
        if (tabMeta.supportsResult) {
          const rf = String(resultFilter || "")
            .trim()
            .toUpperCase();
          if (rf) qs.set("result", rf);
        }

        // cartonbox 전용 필터
        if (activeTab === "cartonbox_print") {
          const srcV = String(cartonSrc || "")
            .trim()
            .toUpperCase();
          const boxV = String(cartonBoxCount || "").trim();

          if (srcV) qs.set("src", srcV);
          if (boxV) qs.set("box_count", boxV);
        }

        const url = `${SERVER_ADDRESS}${tabMeta.list}?${qs.toString()}`;
        const res = await fetch(url, { credentials: "include" });

        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          const text = await res.text();
          console.error(
            "[MonitorDetailUnifiedBackup][CSV] Non-JSON:",
            res.status,
            ct,
            text.slice(0, 200),
          );
          alert("CSV export 중 서버 응답 형식이 올바르지 않습니다.");
          return;
        }

        const result = await res.json();

        if (!result.success) {
          alert(result.message || "CSV export 중 서버 응답에 실패했습니다.");
          return;
        }

        const pageRows = Array.isArray(result.data) ? result.data : [];
        exportRows = exportRows.concat(pageRows);

        exportTotalPages = Math.max(
          1,
          Math.ceil(Number(result.total || 0) / exportPageSize),
        );

        if (currentPage >= exportTotalPages) break;
        currentPage += 1;
      }

      if (exportRows.length === 0) {
        alert("내보낼 데이터가 없습니다.");
        return;
      }

      const headerRow = ["번호", ...columns.map((col) => HEADERS[col] || col)]
        .map(escapeCsv)
        .join(",");

      const bodyRows = exportRows.map((row, index) => {
        const values = [
          index + 1,
          ...columns.map((col) => formatCsvValue(col, row[col])),
        ];
        return values.map(escapeCsv).join(",");
      });

      const csvText = [headerRow, ...bodyRows].join("\r\n");

      const safeFrom = from ? dayjs(from).format("YYYYMMDD_HHmm") : "ALL";
      const safeTo = to ? dayjs(to).format("YYYYMMDD_HHmm") : "ALL";

      const resultSuffix =
        tabMeta.supportsResult && resultFilter
          ? `_${String(resultFilter).trim().toUpperCase()}`
          : "";

      const filename = `backup_monitor_${activeTab}${resultSuffix}_${safeFrom}_${safeTo}.csv`;

      downloadCsvFile(filename, csvText);
    } catch (err) {
      console.error("handleExportCsv error:", err);
      alert("CSV export 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ URL 동기화
  useEffect(() => {
    const next = new URLSearchParams(searchParams);

    next.set("from", from);
    next.set("to", to);
    next.set("type", activeTab);
    next.set("page", String(page));
    next.set("page_size", String(pageSize));

    if (generatorName) next.set("generator_name", generatorName);
    else next.delete("generator_name");

    if (tabMeta.supportsResult) {
      const rf = String(resultFilter || "")
        .trim()
        .toUpperCase();
      if (rf) next.set(`result_${activeTab}`, rf);
      else next.delete(`result_${activeTab}`);
    }

    const aq = String(queryAppliedByTab[activeTab] || "").trim();
    if (aq) next.set(`q_${activeTab}`, aq);
    else next.delete(`q_${activeTab}`);

    if (activeTab === "cartonbox_print") {
      const srcV = String(cartonSrc || "")
        .trim()
        .toUpperCase();
      const boxV = String(cartonBoxCount || "").trim();
      if (srcV) next.set("src", srcV);
      else next.delete("src");
      if (boxV) next.set("box_count", boxV);
      else next.delete("box_count");
    } else {
      next.delete("src");
      next.delete("box_count");
    }

    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    from,
    to,
    activeTab,
    page,
    pageSize,
    generatorName,
    resultFilter,
    queryAppliedByTab,
    cartonSrc,
    cartonBoxCount,
  ]);

  // ✅ 최초 로드시 URL에 저장된 탭별 q_{tab}를 복원
  useEffect(() => {
    const init = {};
    for (const t of TABS) {
      const k = `q_${t.key}`;
      const v = String(searchParams.get(k) || "").trim();
      if (v) init[t.key] = v;
    }
    if (Object.keys(init).length > 0) {
      setQueryAppliedByTab((p) => ({ ...p, ...init }));
      setQueryInputByTab((p) => ({ ...p, ...init }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ 탭 변경 시
  useEffect(() => {
    const nextResultKey = `result_${activeTab}`;
    const nextFilter = searchParams.get(nextResultKey) || "";
    setResultFilter(nextFilter);

    const nextQKey = `q_${activeTab}`;
    const nextQ = String(searchParams.get(nextQKey) || "").trim();

    setQueryAppliedByTab((p) => ({ ...p, [activeTab]: nextQ }));
    setQueryInputByTab((p) => ({
      ...p,
      [activeTab]: p?.[activeTab] ?? nextQ,
    }));

    if (activeTab === "cartonbox_print") {
      setCartonSrc(
        String(searchParams.get("src") || "")
          .trim()
          .toUpperCase(),
      );
      setCartonBoxCount(String(searchParams.get("box_count") || "").trim());
    }

    setPage(1);
    fetchData({
      pageArg: 1,
      resultOverride: nextFilter,
      qOverride: nextQ,
      srcOverride:
        activeTab === "cartonbox_print"
          ? String(searchParams.get("src") || "")
              .trim()
              .toUpperCase()
          : undefined,
      boxOverride:
        activeTab === "cartonbox_print"
          ? String(searchParams.get("box_count") || "").trim()
          : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ✅ 기간 변경 시
  useEffect(() => {
    setPage(1);
    fetchData({ pageArg: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

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

  // ✅ 검색 적용
  const handleSearch = async () => {
    const q = String(queryInput || "").trim();
    setQueryAppliedByTab((p) => ({ ...p, [activeTab]: q }));
    setPage(1);
    await fetchData({ pageArg: 1, qOverride: q });
  };

  const clearSearch = async () => {
    setQueryInputByTab((p) => ({ ...p, [activeTab]: "" }));
    setQueryAppliedByTab((p) => ({ ...p, [activeTab]: "" }));
    setPage(1);
    await fetchData({ pageArg: 1, qOverride: "" });
  };

  const goPrev = () => {
    if (page <= 1) return;
    fetchData({ pageArg: page - 1 });
  };
  const goNext = () => {
    if (page >= totalPages) return;
    fetchData({ pageArg: page + 1 });
  };

  // ✅ Result 필터 변경 시
  const onChangeResultFilter = async (val) => {
    const v = String(val || "")
      .trim()
      .toUpperCase();
    setResultFilter(v);

    const next = new URLSearchParams(searchParams);
    if (v) next.set(`result_${activeTab}`, v);
    else next.delete(`result_${activeTab}`);
    setSearchParams(next, { replace: true });

    setPage(1);
    await fetchData({ pageArg: 1, resultOverride: v });
  };

  const SearchBadge = () => {
    if (!queryApplied) return null;
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 10px",
          borderRadius: 999,
          background: "rgba(79,195,247,0.15)",
          border: "1px solid rgba(79,195,247,0.35)",
          color: "#4fc3f7",
          fontSize: 13,
          whiteSpace: "nowrap",
        }}
        title="현재 탭에서 검색이 적용된 상태입니다."
      >
        <span style={{ fontWeight: 700 }}>검색 적용</span>
        <span style={{ color: "#fff" }}>{queryApplied}</span>
        <button
          onClick={clearSearch}
          style={{
            marginLeft: 6,
            padding: "2px 8px",
            fontSize: 12,
            backgroundColor: "#4fc3f7",
            color: "#000",
            border: "none",
            borderRadius: 999,
            cursor: "pointer",
          }}
        >
          해제
        </button>
      </div>
    );
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
        padding: 20,
        backgroundColor: "#1e1e2f",
        color: "#fff",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <h2 style={{ color: "#4fc3f7", marginBottom: 12 }}>
        {generatorName ? `${generatorName} 상세 이력` : `상세 이력`}
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
          alignItems: "center",
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
              await fetchData({ pageArg: 1, sizeArg: size });
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

        {/* 검색 입력 */}
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flex: "1 0 280px",
          }}
        >
          <input
            placeholder="MAC, 시리얼 검색"
            value={queryInput}
            onChange={(e) =>
              setQueryInputByTab((p) => ({ ...p, [activeTab]: e.target.value }))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
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
          onClick={handleSearch}
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

        <button
          onClick={handleExportCsv}
          style={{
            padding: "6px 12px",
            fontSize: 14,
            backgroundColor: "#22c55e",
            color: "#000",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          CSV Export
        </button>

        <SearchBadge />
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

      {/* ✅ 우측 필터 영역 */}
      <div
        style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}
      >
        {activeTab !== "cartonbox_print" ? (
          <ResultFilter
            enabled={tabMeta.supportsResult}
            value={resultFilter}
            onChange={onChangeResultFilter}
          />
        ) : (
          <div style={FILTER.wrap}>
            <div style={FILTER.group}>
              <span style={FILTER.label}>구분</span>
              <select
                value={cartonSrc}
                onChange={async (e) => {
                  const v = String(e.target.value || "")
                    .trim()
                    .toUpperCase();
                  setCartonSrc(v);
                  setPage(1);
                  await fetchData({ pageArg: 1, srcOverride: v });
                }}
                style={mergeStyle(FILTER.control, { width: 140 })}
              >
                <option value="">전체</option>
                <option value="LOG">LOG</option>
                <option value="EXCEPTION">EXCEPTION</option>
              </select>
            </div>

            <div style={FILTER.group}>
              <span style={FILTER.label}>박스번호</span>
              <input
                type="number"
                inputMode="numeric"
                placeholder="예: 1380"
                value={cartonBoxCount}
                onChange={async (e) => {
                  const v = String(e.target.value || "").trim();
                  setCartonBoxCount(v);
                  setPage(1);
                  await fetchData({ pageArg: 1, boxOverride: v });
                }}
                style={mergeStyle(FILTER.controlCompact, { width: 180 })}
              />
            </div>

            <button
              onClick={async () => {
                setCartonSrc("");
                setCartonBoxCount("");
                setPage(1);
                await fetchData({
                  pageArg: 1,
                  srcOverride: "",
                  boxOverride: "",
                });
              }}
              style={FILTER.button}
              onMouseDown={(e) => e.preventDefault()}
            >
              필터 해제
            </button>
          </div>
        )}
      </div>

      {/* 테이블 스크롤 영역 */}
      <div
        ref={tableScrollRef}
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          overflowX: "auto",
          backgroundColor: "#2b2b40",
          borderRadius: 8,
        }}
      >
        {isLoading ? (
          <div style={{ padding: 16 }}>로딩 중...</div>
        ) : (
          <table
            style={{
              borderCollapse: "collapse",
              tableLayout: "fixed",
              width: "max-content",
              minWidth: "100%",
            }}
          >
            <colgroup>
              <col style={{ width: 60 }} />
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
                  <tr key={r?.id ?? i}>
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
          ),
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
