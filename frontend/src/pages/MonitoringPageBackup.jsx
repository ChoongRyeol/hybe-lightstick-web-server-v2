import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import SERVER_ADDRESS from "../config";
import dayjs from "dayjs";
import { useNavigate, useSearchParams } from "react-router-dom";

const emptyArray = [];

const inputStyle = {
  backgroundColor: "#1e1e2f",
  color: "#fff",
  border: "1px solid #555",
  padding: "6px 8px",
  borderRadius: 6,
};

const buttonBase = {
  padding: "8px 12px",
  fontSize: 14,
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
};

const tdBase = {
  padding: "8px 10px",
  borderBottom: "1px solid #3a3a54",
  borderRight: "1px solid #3a3a54",
  background: "#24243a",
};
const tdNum = {
  ...tdBase,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};
const tdText = { ...tdBase, textAlign: "left", whiteSpace: "nowrap" };

const stickyHeader = { position: "sticky", top: 0, zIndex: 2 };
const stickyFirstCol = { position: "sticky", left: 0, zIndex: 1 };

const headerCell = {
  padding: "10px 12px",
  borderBottom: "1px solid #444",
  borderRight: "1px solid #444",
  background: "#22293a",
  color: "#e8edf5",
  textAlign: "center",
};

const subHeaderCell = {
  padding: "8px 10px",
  borderBottom: "1px solid #444",
  borderRight: "1px solid #444",
  background: "#2a3150",
  fontWeight: 600,
  fontSize: 12,
  color: "#cfd8ea",
};

const monoPill = {
  display: "inline-block",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 12,
  padding: "2px 6px",
  borderRadius: 6,
  background: "#1a2430",
  color: "#cfe8ff",
  border: "1px solid #2c4a56",
  maxWidth: 240,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const boxBadge = {
  marginLeft: 8,
  padding: "1px 6px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  background: "#1b2a34",
  color: "#9ad1ff",
  border: "1px solid #2c4a56",
};

const pctText = { marginLeft: 8, fontSize: 12, color: "#a7c0cd" };
const progressWrap = {
  background: "#1c2a33",
  border: "1px solid #2b4450",
  height: 18,
  borderRadius: 10,
  overflow: "hidden",
};
const progressBar = (pct) => ({
  width: `${pct}%`,
  height: "100%",
  background:
    pct >= 100
      ? "linear-gradient(90deg, #6ee7a8, #81c784)"
      : pct >= 75
        ? "linear-gradient(90deg, #4fc3f7, #64b5f6)"
        : "linear-gradient(90deg, #ffd54f, #ffca28)",
});

const badge = (text, title, style = {}) => (
  <span
    title={title}
    style={{
      display: "inline-block",
      padding: "2px 6px",
      borderRadius: 6,
      marginLeft: 6,
      fontSize: 12,
      fontWeight: 700,
      backgroundColor: "#422",
      color: "#ff8a80",
      border: "1px solid #a44",
      verticalAlign: "middle",
      ...style,
    }}
  >
    {text}
  </span>
);

const FwOverviewBar = ({ fwOverview }) => {
  const waiting = Number(fwOverview?.waiting || 0);
  const fail = Number(fwOverview?.fail || 0);

  if (waiting <= 0 && fail <= 0) return null;

  return (
    <div
      style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}
    >
      {waiting > 0 && (
        <div
          title="F/W Download까지만 완료되고 아직 Device Test/MAC Write와 연결되지 않은 수량"
          style={{
            background: "#3d3318",
            border: "1px solid #b7952b",
            color: "#ffd54f",
            padding: "10px 14px",
            borderRadius: 8,
            fontWeight: 700,
          }}
        >
          🟡 F/W Download 대기 : {waiting.toLocaleString()}
        </div>
      )}

      {fail > 0 && (
        <div
          title="기간 내 F/W Download 실패 로그 수량"
          style={{
            background: "#3a1f1f",
            border: "1px solid #a44",
            color: "#ff8a80",
            padding: "10px 14px",
            borderRadius: 8,
            fontWeight: 700,
          }}
        >
          🔴 F/W Download FAIL : {fail.toLocaleString()}
        </div>
      )}
    </div>
  );
};

const ProcessMiniCard = ({ title, value, color = "#4fc3f7" }) => (
  <div
    style={{
      backgroundColor: "#1e1e2f",
      border: "1px solid #555",
      borderRadius: 8,
      padding: 10,
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}
  >
    <div
      style={{
        fontSize: "0.85rem",
        color: "#ccc",
        borderBottom: "1px solid #444",
        textAlign: "center",
        paddingBottom: 6,
      }}
    >
      {title}
    </div>
    <div
      style={{
        fontWeight: "bold",
        fontSize: "1.4rem",
        color,
        textAlign: "center",
        padding: "10px 0",
      }}
    >
      {Number(value || 0).toLocaleString()}
    </div>
  </div>
);

const MonitoringSummaryCard = memo(function MonitoringSummaryCard({
  item,
  goDetail,
  onSelectGenerator,
  selected,
}) {
  const FW = item.firmware_download || {};
  const MW = item.mac_write || {};
  const CP = item.compare || {};
  const DP = item.device_print || {};
  const GB = item.giftbox_print || {};
  const CB = item.cartonbox_print || {};

  const failFw = Number(FW.fail || 0);
  const failMw = Number(MW.fail || MW.fail_only_unwritten || 0);
  const failCp = Number(CP.fail || CP.fail_only_unwritten || 0);

  return (
    <div
      onClick={() => onSelectGenerator(item.generator_name)}
      style={{
        border: selected ? "1px solid #4fc3f7" : "1px solid #333",
        borderRadius: 12,
        padding: 20,
        backgroundColor: "#2b2b40",
        boxShadow: selected
          ? "0 0 0 1px rgba(79,195,247,0.45), 0 4px 12px rgba(0,0,0,0.3)"
          : "0 4px 12px rgba(0,0,0,0.3)",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
          borderBottom: "1px solid #444",
          paddingBottom: 6,
        }}
      >
        <h3
          style={{
            margin: 0,
            color: "#ffca28",
            fontSize: "1.1rem",
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 8,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          생산관리명: {item.generator_name}
          {/* {failFw > 0 &&
            badge(`FW FAIL ${failFw}`, "F/W Download 실패 수", {
              backgroundColor: "#3a2230",
              borderColor: "#b55",
            })}
          {failMw > 0 && badge(`MW FAIL ${failMw}`, "MAC WRITE 실패 수")}
          {failCp > 0 &&
            badge(`CP FAIL ${failCp}`, "MAC CHECK 실패 수", {
              backgroundColor: "#402b1b",
              borderColor: "#a46a2c",
            })} */}
        </h3>

        <button
          onClick={(e) => {
            e.stopPropagation();
            goDetail(item.generator_name);
          }}
          style={{
            backgroundColor: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
          title="상세보기"
        >
          <img
            src="/images/go_detail.png"
            alt="go_detail"
            style={{ width: 24, height: 24, display: "block" }}
          />
        </button>
      </div>

      <p style={{ marginBottom: 14, fontSize: "0.95rem" }}>
        전체 등록 수 :{" "}
        <strong style={{ color: "#81c784" }}>
          {Number(item.total || 0).toLocaleString()}
        </strong>
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 10,
        }}
      >
        <ProcessMiniCard title="F/W Download" value={FW.completed} />
        <ProcessMiniCard title="🖨️ DEVICE 라벨" value={DP.completed} />
        <ProcessMiniCard title="MAC WRITE 공정" value={MW.completed} />
        <ProcessMiniCard title="MAC CHECK 공정" value={CP.completed} />
        <ProcessMiniCard title="🖨️ GIFTBOX 라벨" value={GB.completed} />
        <ProcessMiniCard title="🖨️ CARTON BOX 라벨" value={CB.completed} />
      </div>
    </div>
  );
});

function MonitoringPageBackup() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const listRef = useRef(null);
  const SCROLL_KEY = "backup-monitoring:scrollTop";

  const getDefaultFrom = () =>
    dayjs().startOf("day").format("YYYY-MM-DDTHH:mm");
  const getDefaultTo = () => dayjs().format("YYYY-MM-DDTHH:mm");

  const [filters, setFilters] = useState({
    from: searchParams.get("from") || getDefaultFrom(),
    to: searchParams.get("to") || getDefaultTo(),
    artist: searchParams.get("artist") || "",
    lightstick: searchParams.get("lightstick") || "",
    serial: searchParams.get("serial") || "",
    mac: searchParams.get("mac") || "",
  });

  const [appliedFilters, setAppliedFilters] = useState({
    from: searchParams.get("from") || getDefaultFrom(),
    to: searchParams.get("to") || getDefaultTo(),
    artist: searchParams.get("artist") || "",
    lightstick: searchParams.get("lightstick") || "",
    serial: searchParams.get("serial") || "",
    mac: searchParams.get("mac") || "",
  });

  const [selectedGenerator, setSelectedGenerator] = useState(
    searchParams.get("g") || "",
  );
  const [statusData, setStatusData] = useState([]);
  const [fwOverview, setFwOverview] = useState({ waiting: 0, fail: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [apiError, setApiError] = useState("");
  const [artists, setArtists] = useState([]);
  const [lightsticks, setLightsticks] = useState([]);
  const [metaLoaded, setMetaLoaded] = useState(false);
  const [isMetaLoading, setIsMetaLoading] = useState(false);
  const [dailyData, setDailyData] = useState([]);
  const [isDailyLoading, setIsDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState("");
  const [showDaily, setShowDaily] = useState(false);
  useEffect(() => {
    const nextFilters = {
      from: searchParams.get("from") || getDefaultFrom(),
      to: searchParams.get("to") || getDefaultTo(),
      artist: searchParams.get("artist") || "",
      lightstick: searchParams.get("lightstick") || "",
      serial: searchParams.get("serial") || "",
      mac: searchParams.get("mac") || "",
    };

    setFilters(nextFilters);
    setAppliedFilters(nextFilters);
    setSelectedGenerator(searchParams.get("g") || "");
  }, [searchParams]);
  useEffect(() => {
    const saved = sessionStorage.getItem(SCROLL_KEY);
    if (saved && listRef.current) listRef.current.scrollTop = Number(saved);
    return () => {
      const top = listRef.current?.scrollTop ?? 0;
      sessionStorage.setItem(SCROLL_KEY, String(top));
    };
  }, []);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setApiError("");

    try {
      const res = await fetch(
        `${SERVER_ADDRESS}/api/backup/status-summary?from=${encodeURIComponent(appliedFilters.from)}&to=${encodeURIComponent(appliedFilters.to)}`,
        { credentials: "include" },
      );
      const result = await res.json();

      if (result.success) {
        setStatusData(Array.isArray(result.data) ? result.data : emptyArray);
        setFwOverview({
          waiting: Number(result.fw_overview?.waiting || 0),
          fail: Number(result.fw_overview?.fail || 0),
        });
      } else {
        setStatusData(emptyArray);
        setFwOverview({ waiting: 0, fail: 0 });
        setApiError(result.message || "API 오류");
      }
    } catch (err) {
      console.error("데이터 요청 실패:", err);
      setStatusData(emptyArray);
      setFwOverview({ waiting: 0, fail: 0 });
      setApiError("네트워크 오류로 데이터를 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [appliedFilters.from, appliedFilters.to]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchStatus]);

  const fetchMetaData = useCallback(async () => {
    if (metaLoaded || isMetaLoading) return;
    setIsMetaLoading(true);

    try {
      const [artistsRes, lightsticksRes] = await Promise.all([
        fetch(`${SERVER_ADDRESS}/api/artists`, { credentials: "include" }),
        fetch(`${SERVER_ADDRESS}/api/lightsticks`, { credentials: "include" }),
      ]);
      const [artistsResult, lightsticksResult] = await Promise.all([
        artistsRes.json(),
        lightsticksRes.json(),
      ]);

      if (artistsResult.success) {
        setArtists(
          Array.from(
            new Set(
              (artistsResult.data || []).map((r) => r.artist).filter(Boolean),
            ),
          ),
        );
      }
      if (lightsticksResult.success) {
        setLightsticks(
          Array.from(
            new Set(
              (lightsticksResult.data || [])
                .map((r) => r.lightstick)
                .filter(Boolean),
            ),
          ),
        );
      }
      setMetaLoaded(true);
    } catch (e) {
      console.error("메타 데이터 로딩 오류:", e);
    } finally {
      setIsMetaLoading(false);
    }
  }, [metaLoaded, isMetaLoading]);

  useEffect(() => {
    const timer = setTimeout(fetchMetaData, 300);
    return () => clearTimeout(timer);
  }, [fetchMetaData]);

  const updateFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleFilter = useCallback(() => {
    const nextFilters = {
      from: filters.from,
      to: filters.to,
      artist: filters.artist || "",
      lightstick: filters.lightstick || "",
      serial: filters.serial || "",
      mac: filters.mac || "",
    };

    console.log("[FILTER APPLY]", nextFilters);

    const qs = new URLSearchParams();
    qs.set("from", nextFilters.from);
    qs.set("to", nextFilters.to);

    if (selectedGenerator) qs.set("g", selectedGenerator);
    if (nextFilters.artist.trim()) qs.set("artist", nextFilters.artist.trim());
    if (nextFilters.lightstick.trim())
      qs.set("lightstick", nextFilters.lightstick.trim());
    if (nextFilters.serial.trim()) qs.set("serial", nextFilters.serial.trim());
    if (nextFilters.mac.trim()) qs.set("mac", nextFilters.mac.trim());

    setSearchParams(qs, { replace: false });

    setShowDaily(false);
    setDailyData([]);
    setDailyError("");
  }, [filters, selectedGenerator, setSearchParams]);

  const generatorOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (statusData || [])
            .map((item) => item?.generator_name)
            .filter(Boolean),
        ),
      ),
    [statusData],
  );

  const filteredData = useMemo(() => {
    if (!selectedGenerator) return statusData;
    return statusData.filter(
      (item) => item.generator_name === selectedGenerator,
    );
  }, [selectedGenerator, statusData]);

  const goDetail = useCallback(
    (generatorName, extra = {}) => {
      const qs = new URLSearchParams();
      qs.set("from", appliedFilters.from);
      qs.set("to", appliedFilters.to);
      if (selectedGenerator) qs.set("g", selectedGenerator);

      const addIf = (k, v) => v && qs.set(k, v);
      addIf("artist", extra.artist ?? appliedFilters.artist);
      addIf("lightstick", extra.lightstick ?? appliedFilters.lightstick);
      addIf("serial", extra.serial ?? appliedFilters.serial);
      addIf("mac", extra.mac ?? appliedFilters.mac);

      navigate({
        pathname: `/backup/monitor-detail/${encodeURIComponent(generatorName)}`,
        search: `?${qs.toString()}`,
      });
    },
    [appliedFilters, selectedGenerator, navigate],
  );

  const handleDetailSearch = useCallback(() => {
    const qs = new URLSearchParams();
    if (appliedFilters.from) qs.set("from", appliedFilters.from);
    if (appliedFilters.to) qs.set("to", appliedFilters.to);
    if (filters.artist.trim()) qs.set("artist", filters.artist.trim());
    if (filters.lightstick.trim())
      qs.set("lightstick", filters.lightstick.trim());
    if (selectedGenerator) qs.set("generator_name", selectedGenerator);

    const q = (filters.mac || filters.serial || "").trim();
    qs.set("type", "mac_write");
    if (q) {
      [
        "mac_write",
        "compare",
        "device_print",
        "giftbox_print",
        "cartonbox_print",
      ].forEach((k) => qs.set(`q_${k}`, q));
    }

    navigate({
      pathname: "/backup/monitor/detail-advanced",
      search: `?${qs.toString()}`,
    });
  }, [appliedFilters, filters, selectedGenerator, navigate]);

  const onEnter = useCallback(
    (e) => {
      if (e.key === "Enter") handleDetailSearch();
    },
    [handleDetailSearch],
  );

  const handleSelectGenerator = useCallback(
    (name) => {
      const nextName = selectedGenerator === name ? "" : name;

      const qs = new URLSearchParams();
      qs.set("from", appliedFilters.from);
      qs.set("to", appliedFilters.to);

      if (nextName) qs.set("g", nextName);
      if (filters.artist.trim()) qs.set("artist", filters.artist.trim());
      if (filters.lightstick.trim())
        qs.set("lightstick", filters.lightstick.trim());
      if (filters.serial.trim()) qs.set("serial", filters.serial.trim());
      if (filters.mac.trim()) qs.set("mac", filters.mac.trim());

      setSearchParams(qs, { replace: false });

      setShowDaily(false);
      setDailyData([]);
      setDailyError("");
    },
    [appliedFilters, filters, selectedGenerator, setSearchParams],
  );

  const fetchDailyProcess = useCallback(async () => {
    if (!selectedGenerator) return;
    setIsDailyLoading(true);
    setDailyError("");

    try {
      const qs = new URLSearchParams();
      qs.set("from", appliedFilters.from);
      qs.set("to", appliedFilters.to);
      qs.set("g", selectedGenerator);
      if (appliedFilters.artist.trim())
        qs.set("artist", appliedFilters.artist.trim());
      if (appliedFilters.lightstick.trim())
        qs.set("lightstick", appliedFilters.lightstick.trim());
      if (appliedFilters.serial.trim())
        qs.set("serial", appliedFilters.serial.trim());
      if (appliedFilters.mac.trim()) qs.set("mac", appliedFilters.mac.trim());

      const res = await fetch(
        `${SERVER_ADDRESS}/api/backup/daily-process?${qs.toString()}`,
        { credentials: "include" },
      );
      const result = await res.json();

      if (result.success)
        setDailyData(Array.isArray(result.data) ? result.data : emptyArray);
      else {
        setDailyError(result.message || "일자별 공정 데이터 로딩 실패");
        setDailyData(emptyArray);
      }
    } catch (e) {
      console.error("일자별 공정 로딩 오류:", e);
      setDailyError("네트워크 오류로 데이터를 불러오지 못했습니다.");
      setDailyData(emptyArray);
    } finally {
      setIsDailyLoading(false);
    }
  }, [selectedGenerator, appliedFilters]);

  const handleRefreshAll = useCallback(() => {
    fetchStatus();
    if (selectedGenerator && showDaily) fetchDailyProcess();
  }, [fetchStatus, selectedGenerator, showDaily, fetchDailyProcess]);

  useEffect(() => {
    setShowDaily(false);
    setDailyData([]);
    setDailyError("");
  }, [appliedFilters, selectedGenerator]);

  const handleToggleDaily = useCallback(async () => {
    if (!selectedGenerator) return;
    const nextShow = !showDaily;
    setShowDaily(nextShow);
    if (nextShow && dailyData.length === 0 && !isDailyLoading)
      await fetchDailyProcess();
  }, [
    selectedGenerator,
    showDaily,
    dailyData.length,
    isDailyLoading,
    fetchDailyProcess,
  ]);

  const renderDailyTable = () => {
    if (!selectedGenerator || !showDaily) return null;

    return (
      <div style={{ marginTop: 28 }}>
        <h3 style={{ marginBottom: 12, color: "#ffd54f" }}>
          📅 날짜별 공정 현황 — {selectedGenerator}
        </h3>
        {isDailyLoading ? (
          <div style={{ color: "#bbb" }}>
            일자별 공정 데이터를 불러오는 중...
          </div>
        ) : dailyError ? (
          <div style={{ color: "#ff8a80" }}>{dailyError}</div>
        ) : dailyData.length === 0 ? (
          <div style={{ color: "#bbb" }}>표시할 데이터가 없습니다.</div>
        ) : (
          <DailyTable data={dailyData} />
        )}
      </div>
    );
  };

  return (
    <div
      ref={listRef}
      style={{
        padding: 40,
        backgroundColor: "#1e1e2f",
        color: "#fff",
        height: "100vh",
        width: "100%",
        boxSizing: "border-box",
        overflowY: "auto",
        overflowX: "hidden",
        WebkitOverflowScrolling: "touch",
        display: "block",
      }}
    >
      <h2 style={{ marginBottom: 16, color: "#4fc3f7" }}>
        응원봉 생산 관리 모니터링 V2 (Backup)
      </h2>

      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 12,
          flexWrap: "wrap",
          backgroundColor: "#2b2b40",
          padding: "12px 16px",
          borderRadius: 8,
          alignItems: "center",
        }}
      >
        <div>
          <label>From: </label>
          <input
            type="datetime-local"
            value={filters.from}
            onChange={(e) => updateFilter("from", e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label>To: </label>
          <input
            type="datetime-local"
            value={filters.to}
            onChange={(e) => updateFilter("to", e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label>생산관리명 : </label>
          <select
            value={selectedGenerator}
            onChange={(e) => handleSelectGenerator(e.target.value)}
            style={inputStyle}
          >
            <option value="">전체</option>
            {generatorOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handleFilter}
          style={{ ...buttonBase, backgroundColor: "#4fc3f7", color: "#000" }}
        >
          필터 적용
        </button>
        <button
          onClick={handleRefreshAll}
          style={{ ...buttonBase, backgroundColor: "#81c784", color: "#000" }}
        >
          🔄 새로고침
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          자동 새로고침
        </label>
      </div>

      <FwOverviewBar fwOverview={fwOverview} />

      {apiError && (
        <div
          style={{
            background: "#3a1f1f",
            border: "1px solid #a44",
            color: "#ff8a80",
            padding: "8px 12px",
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          {apiError}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 10,
          marginBottom: 18,
          backgroundColor: "#26263A",
          padding: "12px 16px",
          borderRadius: 8,
        }}
      >
        <FilterSelect
          label="아티스트"
          value={filters.artist}
          onChange={(v) => updateFilter("artist", v)}
          options={artists}
          onFocus={fetchMetaData}
          loading={isMetaLoading}
        />
        <FilterSelect
          label="응원봉"
          value={filters.lightstick}
          onChange={(v) => updateFilter("lightstick", v)}
          options={lightsticks}
          onFocus={fetchMetaData}
        />
        <FilterInput
          label="시리얼"
          value={filters.serial}
          onChange={(v) => updateFilter("serial", v)}
          onKeyDown={onEnter}
          placeholder="예) WCB-0000000"
        />
        <FilterInput
          label="MAC"
          value={filters.mac}
          onChange={(v) => updateFilter("mac", v.toUpperCase())}
          onKeyDown={onEnter}
          placeholder="예) 80:DE:CC:11:22:33"
          uppercase
        />
        <div style={{ display: "flex", alignItems: "end", gap: 8 }}>
          <button
            onClick={handleDetailSearch}
            style={{
              ...buttonBase,
              backgroundColor: "#ffd54f",
              color: "#000",
              width: "100%",
            }}
          >
            🔎 이력 조회
          </button>
        </div>
      </div>

      {selectedGenerator && (
        <div
          style={{
            marginBottom: 20,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              background: "#273043",
              border: "1px solid #39506b",
              color: "#cfe8ff",
              fontWeight: 600,
            }}
          >
            선택된 생산관리명: {selectedGenerator}
          </div>
          <button
            onClick={handleToggleDaily}
            style={{
              ...buttonBase,
              backgroundColor: showDaily ? "#ffb74d" : "#64b5f6",
              color: "#000",
            }}
          >
            {showDaily ? "📕 날짜별 공정 숨기기" : "📅 날짜별 공정 보기"}
          </button>
        </div>
      )}

      {isLoading ? (
        <div>로딩 중...</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            gap: 16,
          }}
        >
          {filteredData.map((item) => (
            <MonitoringSummaryCard
              key={item.generator_name}
              item={item}
              goDetail={goDetail}
              onSelectGenerator={handleSelectGenerator}
              selected={selectedGenerator === item.generator_name}
            />
          ))}
        </div>
      )}

      {renderDailyTable()}
    </div>
  );
}

const FilterSelect = ({
  label,
  value,
  onChange,
  options,
  onFocus,
  loading,
}) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <label style={{ fontSize: 12, color: "#bbb" }}>{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      style={inputStyle}
    >
      <option value="">-- 선택 --</option>
      {options.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
    {loading && (
      <span style={{ fontSize: 11, color: "#999" }}>목록 불러오는 중...</span>
    )}
  </div>
);

const FilterInput = ({
  label,
  value,
  onChange,
  onKeyDown,
  placeholder,
  uppercase,
}) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <label style={{ fontSize: 12, color: "#bbb" }}>{label}</label>
    <input
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      style={{ ...inputStyle, textTransform: uppercase ? "uppercase" : "none" }}
    />
  </div>
);

const DailyTable = ({ data }) => (
  <div
    style={{
      overflowX: "auto",
      overflowY: "auto",
      maxHeight: "60vh",
      border: "1px solid #333",
      borderRadius: 8,
      backgroundColor: "#2b2b40",
      WebkitOverflowScrolling: "touch",
    }}
  >
    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        color: "#e0e0e0",
        minWidth: 1280,
      }}
    >
      <thead>
        <tr>
          <th
            rowSpan={2}
            style={{
              ...headerCell,
              ...stickyHeader,
              textAlign: "center",
              minWidth: 120,
            }}
          >
            일자
          </th>
          {[
            ["🖨️ Device 라벨", 3],
            ["MAC Write 공정", 4],
            ["Mac Check 공정", 4],
            ["🖨️ GiftBox 라벨", 3],
            ["🖨️ Carton Box 라벨", 4],
          ].map(([label, span]) => (
            <th
              key={label}
              colSpan={span}
              style={{ ...headerCell, textAlign: "center" }}
            >
              {label}
            </th>
          ))}
        </tr>
        <tr>
          {["누적", "투입수", "최종 시리얼 번호"].map((sub) => (
            <th
              key={`dp-${sub}`}
              style={{ ...subHeaderCell, textAlign: "center" }}
            >
              {sub}
            </th>
          ))}
          {["누적", "투입수", "불량수", "최종 시리얼 번호"].map((sub) => (
            <th
              key={`mw-${sub}`}
              style={{ ...subHeaderCell, textAlign: "center" }}
            >
              {sub}
            </th>
          ))}
          {["누적", "투입수", "불량수", "최종 시리얼 번호"].map((sub) => (
            <th
              key={`cp-${sub}`}
              style={{ ...subHeaderCell, textAlign: "center" }}
            >
              {sub}
            </th>
          ))}
          {["누적", "투입수", "최종 시리얼 번호"].map((sub) => (
            <th
              key={`gb-${sub}`}
              style={{ ...subHeaderCell, textAlign: "center" }}
            >
              {sub}
            </th>
          ))}
          {["누적", "투입수", "최종 시리얼 번호", "카톤 박스번호"].map(
            (sub, j) => (
              <th
                key={`cb-${sub}`}
                style={{
                  ...subHeaderCell,
                  borderRight: j === 3 ? "none" : subHeaderCell.borderRight,
                  textAlign: "center",
                }}
              >
                {sub}
              </th>
            ),
          )}
        </tr>
      </thead>
      <tbody>
        {data.map((row, idx) => (
          <DailyRow key={row.date || idx} row={row} idx={idx} />
        ))}
      </tbody>
    </table>
  </div>
);

const DailyRow = ({ row, idx }) => {
  const cells = (k) => {
    const v = row?.[k] || {};
    return {
      cumulative: v.cumulative ?? 0,
      input: v.input ?? 0,
      defective: v.fail ?? 0,
      last_serial: v.last_serial ?? "",
    };
  };
  const dp = cells("device_print");
  const mw = cells("mac_write");
  const cp = cells("compare");
  const gb = cells("giftbox_print");
  const cbBase = cells("cartonbox_print");
  const cbRaw = row?.cartonbox_print || {};
  const cb = {
    ...cbBase,
    last_box_count: Number(cbRaw.last_box_count ?? 0),
    last_box_total_count: Number(cbRaw.last_box_total_count ?? 0),
  };
  const boxPct =
    cb.last_box_total_count > 0
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round((cb.last_box_count / cb.last_box_total_count) * 100),
          ),
        )
      : 0;

  const num = (v) => (Number(v || 0) > 0 ? Number(v).toLocaleString() : "–");
  const serial = (v) => (v ? <span style={monoPill}>{v}</span> : null);

  return (
    <tr
      style={{
        background: idx % 2 === 0 ? "#24243a" : "#23233a",
        transition: "background-color 120ms ease",
      }}
    >
      <td
        style={{
          ...stickyFirstCol,
          padding: "10px 12px",
          borderBottom: "1px solid #3a3a54",
          borderRight: "1px solid #3a3a54",
          background: "#1e1e2f",
          fontWeight: 700,
          whiteSpace: "nowrap",
          minWidth: 120,
        }}
      >
        {row.date}
      </td>
      <td style={tdNum}>{num(dp.cumulative)}</td>
      <td style={tdNum}>{num(dp.input)}</td>
      <td style={tdText}>{serial(dp.last_serial)}</td>
      <td style={tdNum}>{num(mw.cumulative)}</td>
      <td style={tdNum}>{num(mw.input)}</td>
      <td style={tdNum}>{num(mw.defective)}</td>
      <td style={tdText}>{serial(mw.last_serial)}</td>
      <td style={tdNum}>{num(cp.cumulative)}</td>
      <td style={tdNum}>{num(cp.input)}</td>
      <td style={tdNum}>{num(cp.defective)}</td>
      <td style={tdText}>{serial(cp.last_serial)}</td>
      <td style={tdNum}>{num(gb.cumulative)}</td>
      <td style={tdNum}>{num(gb.input)}</td>
      <td style={tdText}>{serial(gb.last_serial)}</td>
      <td style={tdNum}>{num(cb.cumulative)}</td>
      <td style={tdNum}>{num(cb.input)}</td>
      <td style={tdText}>{serial(cb.last_serial)}</td>
      <td style={{ ...tdNum, borderRight: "none" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <span style={boxBadge}>
            {cb.last_box_count} / {cb.last_box_total_count}
          </span>
          <span style={pctText}>{boxPct}%</span>
        </div>
        <div style={{ ...progressWrap, marginTop: 6 }}>
          <div style={progressBar(boxPct)} />
        </div>
      </td>
    </tr>
  );
};

export default MonitoringPageBackup;
