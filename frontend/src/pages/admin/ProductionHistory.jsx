import { useEffect, useState } from "react";
import SERVER_ADDRESS from "../../config";
import { fetchWithAuth } from "../../utils/fetchWithAuth";

const LIMIT = 20;
const MAX_EXPORT_RANGE = 100000;

function ProductionHistory() {
  const [summaryList, setSummaryList] = useState([]);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedGenerators, setSelectedGenerators] = useState([]);
  const [mergeName, setMergeName] = useState("");
  const [hideReason, setHideReason] = useState("");
  const [isBackingup, setIsBackingup] = useState(false);
  const [deletingGenerator, setDeletingGenerator] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // ✅ 분리용 시리얼 범위 입력
  const [splitSerialStart, setSplitSerialStart] = useState("");
  const [splitSerialEnd, setSplitSerialEnd] = useState("");

  // ✅ CSV Export UI
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportSerialStart, setExportSerialStart] = useState("");
  const [exportSerialEnd, setExportSerialEnd] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  const parseSerialInfo = (serial) => {
    const value = String(serial || "").trim();
    const match = value.match(/^(.*?)(\d+)$/);

    if (!match) return null;

    return {
      raw: value,
      prefix: match[1],
      number: Number(match[2]),
    };
  };

  const getExportRangeCount = (startSerial, endSerial) => {
    const startInfo = parseSerialInfo(startSerial);
    const endInfo = parseSerialInfo(endSerial);

    if (!startInfo || !endInfo) {
      return { valid: false, message: "시리얼 형식이 올바르지 않습니다." };
    }

    if (startInfo.prefix !== endInfo.prefix) {
      return {
        valid: false,
        message: "시리얼 시작/끝 prefix가 다릅니다.",
      };
    }

    if (endInfo.number < startInfo.number) {
      return {
        valid: false,
        message: "시리얼 끝 번호는 시작 번호보다 작을 수 없습니다.",
      };
    }

    const count = endInfo.number - startInfo.number + 1;

    if (count > MAX_EXPORT_RANGE) {
      return {
        valid: false,
        count,
        message: `CSV Export는 최대 ${MAX_EXPORT_RANGE.toLocaleString()}건까지만 가능합니다. 현재 요청 범위는 ${count.toLocaleString()}건입니다.`,
      };
    }

    return {
      valid: true,
      count,
      startInfo,
      endInfo,
    };
  };

  const fetchSummary = async (targetPage = page) => {
    setIsLoading(true);

    try {
      const res = await fetchWithAuth(
        `${SERVER_ADDRESS}/api/generated/range-summary?page=${targetPage}&limit=${LIMIT}`,
      );
      const result = await res.json();

      if (result.success) {
        setSummaryList(result.data || []);
        setTotalCount(result.totalCount || 0);
        return result;
      } else {
        alert("데이터 조회 실패");
        return null;
      }
    } catch (err) {
      console.error("❌ 데이터 조회 오류:", err);
      alert("서버 오류");
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // ✅ 선택이 1개일 때, splitSerialStart 자동 입력
  useEffect(() => {
    if (selectedGenerators.length === 1) {
      const selectedName = selectedGenerators[0];
      const selectedItem = summaryList.find(
        (x) => x.generator_name === selectedName,
      );

      if (selectedItem) {
        const autoStart = String(
          selectedItem.serial_start || selectedItem.serial || "",
        ).trim();
        if (autoStart) setSplitSerialStart(autoStart);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGenerators, summaryList]);

  const totalPages = Math.ceil(totalCount / LIMIT);

  const handleBackup = async (generatorName) => {
    if (!window.confirm("정말 백업하시겠습니까?")) return;

    setIsBackingup(true);

    try {
      const res = await fetchWithAuth(
        `${SERVER_ADDRESS}/api/generated/backup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ generator_name: generatorName }),
        },
      );

      const result = await res.json();

      if (result.success) {
        setSelectedGenerators((prev) =>
          prev.filter((name) => name !== generatorName),
        );

        const nextTotalCount = Math.max(0, totalCount - 1);
        const nextTotalPages = Math.max(1, Math.ceil(nextTotalCount / LIMIT));
        const targetPage =
          page + 1 > nextTotalPages ? nextTotalPages - 1 : page;

        if (targetPage !== page) {
          setPage(targetPage);
        }

        await fetchSummary(targetPage);

        alert(result.message || "백업 완료");
      } else {
        alert("백업 실패: " + result.message);
      }
    } catch (err) {
      console.error("❌ 백업 오류:", err);
      alert("백업 오류");
    } finally {
      setIsBackingup(false);
    }
  };

  const handleDelete = async (generatorName) => {
    if (!window.confirm(`정말 '${generatorName}' 을(를) 삭제할건가요?`)) return;

    if (
      !window.confirm(
        "이 작업은 복구되지 않습니다.\n관련 데이터가 모두 삭제될 수 있습니다.\n계속하시겠습니까?",
      )
    )
      return;

    setDeletingGenerator(generatorName);

    try {
      const res = await fetchWithAuth(
        `${SERVER_ADDRESS}/api/generated/delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ generator_name: generatorName }),
        },
      );

      const result = await res.json();

      if (result.success) {
        setSelectedGenerators((prev) =>
          prev.filter((name) => name !== generatorName),
        );

        const nextTotalCount = Math.max(0, totalCount - 1);
        const nextTotalPages = Math.max(1, Math.ceil(nextTotalCount / LIMIT));
        const targetPage =
          page + 1 > nextTotalPages ? nextTotalPages - 1 : page;

        if (targetPage !== page) {
          setPage(targetPage);
        }

        await fetchSummary(targetPage);

        alert(result.message || "삭제 완료");
      } else {
        alert("삭제 실패: " + result.message);
      }
    } catch (err) {
      console.error("❌ 삭제 오류:", err);
      alert("삭제 오류");
    } finally {
      setDeletingGenerator("");
    }
  };

  const handleMerge = async () => {
    const sources = [
      ...new Set(
        (selectedGenerators || [])
          .map((v) => String(v || "").trim())
          .filter(Boolean),
      ),
    ];
    const target = String(mergeName || "").trim();

    if (sources.length < 2) {
      alert("❌ 병합할 이력을 2개 이상 선택하세요.");
      return;
    }
    if (!target) {
      alert("❌ 병합 이름을 입력하세요.");
      return;
    }
    if (sources.includes(target)) {
      alert(
        "❌ 병합 대상 이름이 선택된 항목에 포함되어 있습니다.\n(대상은 source에 포함될 수 없습니다)",
      );
      return;
    }

    if (
      !window.confirm(
        `선택된 ${sources.length}개 이력을 '${target}'로 병합하시겠습니까?`,
      )
    )
      return;

    try {
      const res = await fetchWithAuth(`${SERVER_ADDRESS}/api/generated/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_generators: sources,
          target_generator: target,
        }),
      });

      const result = await res.json();

      if (res.ok && result.success) {
        alert("✅ 병합 완료");
        setSelectedGenerators([]);
        setMergeName("");
        fetchSummary();
      } else {
        alert("❌ 병합 실패: " + (result?.message || `HTTP ${res.status}`));
      }
    } catch (err) {
      console.error("❌ 병합 오류:", err);
      alert("서버 오류");
    }
  };

  const handleSplit = async () => {
    const source = String(selectedGenerators?.[0] || "").trim();
    const target = String(mergeName || "").trim();
    const start = String(splitSerialStart || "").trim();
    const end = String(splitSerialEnd || "").trim();

    if (selectedGenerators.length !== 1) {
      alert("❌ 분리는 1개 항목만 선택 가능합니다.");
      return;
    }
    if (!target) {
      alert("❌ 새 생산명 입력이 필요합니다. (분리 대상 생산명)");
      return;
    }
    if (source === target) {
      alert("❌ 새 생산명은 기존 생산명과 달라야 합니다.");
      return;
    }
    if (!start || !end) {
      alert("❌ 시리얼 시작/끝을 입력하세요.");
      return;
    }

    if (
      !window.confirm(
        `'${source}'에서 시리얼 [${start} ~ ${end}] 범위를 '${target}'로 분리하시겠습니까?`,
      )
    )
      return;

    try {
      const res = await fetchWithAuth(`${SERVER_ADDRESS}/api/generated/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_generator: source,
          target_generator: target,
          serial_start: start,
          serial_end: end,
        }),
      });

      const result = await res.json();

      if (res.ok && result.success) {
        alert("✅ 분리 완료");
        setSelectedGenerators([]);
        setMergeName("");
        setSplitSerialStart("");
        setSplitSerialEnd("");
        fetchSummary();
      } else {
        alert("❌ 분리 실패: " + (result?.message || `HTTP ${res.status}`));
      }
    } catch (err) {
      console.error("❌ 분리 오류:", err);
      alert("서버 오류");
    }
  };

  const handleHide = async () => {
    if (selectedGenerators.length === 0) {
      alert("숨길 항목을 선택하세요.");
      return;
    }

    const payload = {
      generator_names: selectedGenerators,
      hide_reason: hideReason,
    };

    try {
      const res = await fetchWithAuth(`${SERVER_ADDRESS}/api/generated/hide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (result.success) {
        alert("✅ 숨김 처리 완료");
        setSelectedGenerators([]);
        fetchSummary();
      } else {
        alert("❌ 실패: " + result.message);
      }
    } catch (err) {
      console.error("❌ 숨기기 오류:", err);
      alert("서버 오류");
    }
  };

  const handleShow = async () => {
    if (selectedGenerators.length === 0) {
      alert("표시할 항목을 선택하세요.");
      return;
    }

    try {
      const res = await fetchWithAuth(`${SERVER_ADDRESS}/api/generated/show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generator_names: selectedGenerators }),
      });

      const result = await res.json();
      if (result.success) {
        alert("✅ 표시(숨김 해제) 완료");
        setSelectedGenerators([]);
        fetchSummary();
      } else {
        alert("❌ 실패: " + result.message);
      }
    } catch (err) {
      console.error("❌ 보이기 오류:", err);
      alert("서버 오류");
    }
  };

  const isMergeable = () => {
    if (selectedGenerators.length < 2 || !mergeName) return false;

    const selectedItems = summaryList.filter((item) =>
      selectedGenerators.includes(item.generator_name),
    );

    if (selectedItems.length === 0) return false;

    const first = selectedItems[0];
    return selectedItems.every(
      (item) =>
        item.artist === first.artist && item.lightstick === first.lightstick,
    );
  };

  const isSplittable = () => {
    if (selectedGenerators.length !== 1) return false;

    const target = String(mergeName || "").trim();
    const start = String(splitSerialStart || "").trim();
    const end = String(splitSerialEnd || "").trim();
    if (!target || !start || !end) return false;

    const source = String(selectedGenerators[0] || "").trim();
    if (!source) return false;
    if (source === target) return false;

    return true;
  };

  const openExportModal = () => {
    if (selectedGenerators.length !== 1) {
      alert("CSV Export는 생산명 1개만 선택해야 합니다.");
      return;
    }

    const selectedName = selectedGenerators[0];
    const selectedItem = summaryList.find(
      (x) => x.generator_name === selectedName,
    );

    setExportSerialStart(String(selectedItem?.serial_start || "").trim());
    setExportSerialEnd(String(selectedItem?.serial_end || "").trim());
    setExportMessage("");
    setShowExportModal(true);
  };

  const handleExportConfirm = async () => {
    const generator_name = String(selectedGenerators?.[0] || "").trim();
    const serial_start = String(exportSerialStart || "").trim();
    const serial_end = String(exportSerialEnd || "").trim();

    if (!generator_name) {
      alert("생산명을 선택하세요.");
      return;
    }

    if (!serial_start || !serial_end) {
      alert("시리얼 시작/끝을 입력하세요.");
      return;
    }

    const rangeCheck = getExportRangeCount(serial_start, serial_end);

    if (!rangeCheck.valid) {
      alert(rangeCheck.message);
      return;
    }

    if (
      !window.confirm(
        `'${generator_name}'\n시리얼 범위 [${serial_start} ~ ${serial_end}] 로 CSV를 생성하시겠습니까?\n\n예상 범위 수량: ${rangeCheck.count.toLocaleString()}건`,
      )
    ) {
      return;
    }

    setIsExporting(true);
    setExportMessage(
      `CSV 파일 생성 중... (요청 범위 ${rangeCheck.count.toLocaleString()}건)`,
    );

    try {
      const res = await fetchWithAuth(`${SERVER_ADDRESS}/api/export/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generator_name,
          serial_start,
          serial_end,
        }),
      });

      const result = await res.json();

      if (!result.success) {
        alert("CSV Export 실패: " + result.message);
        setExportMessage("");
        return;
      }

      setExportMessage("CSV 생성 완료. 다운로드 시작 중...");

      const downloadUrl = `${SERVER_ADDRESS}${result.downloadUrl}`;
      window.open(downloadUrl, "_blank");

      alert("CSV 생성 완료 및 다운로드를 시작했습니다.");
      setShowExportModal(false);
      setExportSerialStart("");
      setExportSerialEnd("");
      setExportMessage("");
    } catch (err) {
      console.error("❌ CSV Export 오류:", err);
      alert("CSV Export 중 서버 오류");
      setExportMessage("");
    } finally {
      setIsExporting(false);
    }
  };

  const isBusy = isLoading || isBackingup || !!deletingGenerator || isExporting;

  return (
    <div
      style={{
        padding: "24px",
        fontFamily: "Segoe UI, sans-serif",
        backgroundColor: "#f9fafb",
        width: "100%",
        boxSizing: "border-box",
        overflowX: "hidden",
      }}
    >
      <h2 style={{ marginBottom: "16px", fontSize: "1.8rem", color: "#333" }}>
        📖 생산 관리 조회
      </h2>

      <div
        style={{
          background: "#fff",
          padding: "20px",
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          width: "100%",
          overflowX: "auto",
          position: "relative",
        }}
      >
        {isLoading && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px 14px",
              borderRadius: "8px",
              backgroundColor: "#eff6ff",
              color: "#1d4ed8",
              fontWeight: "600",
              border: "1px solid #bfdbfe",
            }}
          >
            조회중...
          </div>
        )}

        <table
          style={{
            width: "100%",
            minWidth: "1080px",
            borderCollapse: "collapse",
            fontFamily: "monospace",
            textAlign: "center",
            opacity: isLoading ? 0.65 : 1,
            transition: "opacity 0.2s ease",
          }}
        >
          <thead>
            <tr
              style={{
                backgroundColor: "#f4f6f8",
                fontWeight: "bold",
                fontSize: "0.95rem",
              }}
            >
              <th style={{ padding: "10px" }}>선택</th>
              <th style={{ padding: "10px" }}>No</th>
              <th style={{ padding: "10px" }}>생산명</th>
              <th style={{ padding: "10px" }}>Start MAC</th>
              <th style={{ padding: "10px" }}>End MAC</th>
              <th style={{ padding: "10px" }}>총갯수</th>
              <th style={{ padding: "10px" }}>연속</th>
              <th style={{ padding: "10px" }}>숨김</th>
              <th style={{ padding: "10px" }}>아티스트</th>
              <th style={{ padding: "10px" }}>응원봉</th>
              <th style={{ padding: "10px" }}>Device</th>
              <th style={{ padding: "10px" }}>FW</th>
              <th style={{ padding: "10px" }}>Serial</th>
              <th style={{ padding: "10px" }}>Model</th>
              <th style={{ padding: "10px" }}>인증</th>
              <th style={{ padding: "10px" }}>등록일</th>
              <th style={{ padding: "10px" }}>백업</th>
              <th style={{ padding: "10px" }}>삭제</th>
            </tr>
          </thead>

          <tbody>
            {summaryList.map((item, idx) => {
              const createdDate = item.created_at
                ? new Date(item.created_at.replace(" ", "T")).toLocaleString(
                    "ko-KR",
                  )
                : "-";

              const isDeletingThisRow =
                deletingGenerator === item.generator_name;

              return (
                <tr
                  key={`${item.generator_name}-${idx}`}
                  style={{
                    borderBottom: "1px solid #e0e0e0",
                    fontSize: "0.9rem",
                  }}
                >
                  <td style={{ padding: "8px" }}>
                    <input
                      type="checkbox"
                      disabled={isBusy}
                      checked={selectedGenerators.includes(item.generator_name)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSelectedGenerators((prev) =>
                          checked
                            ? [...prev, item.generator_name]
                            : prev.filter(
                                (name) => name !== item.generator_name,
                              ),
                        );
                      }}
                    />
                  </td>

                  <td style={{ padding: "8px" }}>{page * LIMIT + idx + 1}</td>
                  <td style={{ padding: "8px" }}>{item.generator_name}</td>
                  <td style={{ padding: "8px" }}>{item.start_mac}</td>
                  <td style={{ padding: "8px" }}>{item.end_mac}</td>
                  <td style={{ padding: "8px" }}>{item.distinct_count}</td>
                  <td style={{ padding: "8px" }}>{item.is_continuous}</td>

                  <td style={{ padding: "8px" }}>
                    {item.is_hidden ? (
                      <span style={{ color: "#ff4d4f", fontWeight: "bold" }}>
                        숨김
                      </span>
                    ) : (
                      <span style={{ color: "#22c55e", fontWeight: "bold" }}>
                        표시
                      </span>
                    )}
                  </td>

                  <td style={{ padding: "8px" }}>{item.artist}</td>
                  <td style={{ padding: "8px" }}>{item.lightstick}</td>
                  <td style={{ padding: "8px" }}>{item.device_name}</td>
                  <td style={{ padding: "8px" }}>{item.fw_version}</td>
                  <td style={{ padding: "8px" }}>
                    {item.serial_start && item.serial_end
                      ? `${item.serial_start} / ${item.serial_end}`
                      : "-"}
                  </td>
                  <td style={{ padding: "8px" }}>{item.model}</td>
                  <td style={{ padding: "8px" }}>{item.certification_info}</td>
                  <td style={{ padding: "8px" }}>{createdDate}</td>

                  <td style={{ padding: "8px" }}>
                    <button
                      disabled={isBusy}
                      onClick={() => handleBackup(item.generator_name)}
                      style={{
                        backgroundColor: isBusy ? "#aaa" : "#f59e0b",
                        color: "#fff",
                        border: "none",
                        padding: "4px 8px",
                        borderRadius: "4px",
                        cursor: isBusy ? "not-allowed" : "pointer",
                      }}
                    >
                      {isBackingup ? "백업 중…" : "백업"}
                    </button>
                  </td>

                  <td style={{ padding: "8px" }}>
                    <button
                      disabled={isBusy}
                      onClick={() => handleDelete(item.generator_name)}
                      style={{
                        backgroundColor: isBusy ? "#aaa" : "#ef4444",
                        color: "#fff",
                        border: "none",
                        padding: "4px 8px",
                        borderRadius: "4px",
                        cursor: isBusy ? "not-allowed" : "pointer",
                      }}
                    >
                      {isDeletingThisRow ? "삭제 중…" : "삭제"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div
          style={{
            marginTop: "20px",
            display: "flex",
            gap: "10px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <input
            type="text"
            placeholder="새 생산명 입력"
            disabled={isBusy}
            value={mergeName}
            onChange={(e) => setMergeName(e.target.value)}
            style={{
              padding: "6px",
              borderRadius: "4px",
              border: "1px solid #ccc",
            }}
          />

          <button
            disabled={isBusy || !isMergeable()}
            onClick={() => {
              if (!isMergeable()) {
                alert("같은 아티스트와 응원봉만 병합 가능합니다.");
                return;
              }
              handleMerge();
            }}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              backgroundColor: isBusy || !isMergeable() ? "#a5d6a7" : "#4caf50",
              color: "#fff",
              border: "none",
              cursor: isBusy || !isMergeable() ? "not-allowed" : "pointer",
            }}
          >
            선택 항목 병합
          </button>

          <input
            type="text"
            placeholder="시리얼 시작"
            disabled={isBusy}
            value={splitSerialStart}
            onChange={(e) => setSplitSerialStart(e.target.value)}
            style={{
              padding: "6px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              width: 140,
            }}
          />
          <input
            type="text"
            placeholder="시리얼 끝"
            disabled={isBusy}
            value={splitSerialEnd}
            onChange={(e) => setSplitSerialEnd(e.target.value)}
            style={{
              padding: "6px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              width: 140,
            }}
          />
          <button
            disabled={isBusy || !isSplittable()}
            onClick={handleSplit}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              backgroundColor:
                isBusy || !isSplittable() ? "#93c5fd" : "#2563eb",
              color: "#fff",
              border: "none",
              cursor: isBusy || !isSplittable() ? "not-allowed" : "pointer",
            }}
          >
            선택 항목 분리
          </button>

          <button
            disabled={isBusy || selectedGenerators.length !== 1}
            onClick={openExportModal}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              backgroundColor:
                isBusy || selectedGenerators.length !== 1
                  ? "#cbd5e1"
                  : "#0f766e",
              color: "#fff",
              border: "none",
              cursor:
                isBusy || selectedGenerators.length !== 1
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            CSV Export
          </button>

          <button
            disabled={isBusy || selectedGenerators.length === 0}
            onClick={handleHide}
            style={{
              marginLeft: "auto",
              marginRight: 10,
              padding: "6px 12px",
              borderRadius: "6px",
              backgroundColor:
                isBusy || selectedGenerators.length === 0
                  ? "#a5d6a7"
                  : "#4caf50",
              color: "#fff",
              border: "none",
              cursor:
                isBusy || selectedGenerators.length === 0
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            항목 숨기기
          </button>

          <button
            disabled={isBusy || selectedGenerators.length === 0}
            onClick={handleShow}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              backgroundColor:
                isBusy || selectedGenerators.length === 0
                  ? "#a5d6a7"
                  : "#4caf50",
              color: "#fff",
              border: "none",
              cursor:
                isBusy || selectedGenerators.length === 0
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            항목 보이기
          </button>
        </div>

        <div
          style={{
            marginTop: "20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <button
            disabled={isBusy || page === 0}
            onClick={() => setPage((p) => p - 1)}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              backgroundColor: isBusy || page === 0 ? "#f0f0f0" : "#e0e0e0",
              border: "none",
              cursor: isBusy || page === 0 ? "not-allowed" : "pointer",
            }}
          >
            ◀ 이전
          </button>

          <span style={{ fontWeight: "500" }}>
            페이지 {page + 1} / {totalPages || 1}
          </span>

          <button
            disabled={isBusy || page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              backgroundColor:
                isBusy || page + 1 >= totalPages ? "#f0f0f0" : "#e0e0e0",
              border: "none",
              cursor:
                isBusy || page + 1 >= totalPages ? "not-allowed" : "pointer",
            }}
          >
            다음 ▶
          </button>
        </div>
      </div>

      {showExportModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              width: "420px",
              background: "#fff",
              borderRadius: "12px",
              padding: "24px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>CSV Export</h3>

            <div style={{ marginBottom: 12, color: "#374151" }}>
              <div>
                <b>생산명:</b> {selectedGenerators[0]}
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", marginBottom: 16 }}>
              <input
                type="text"
                placeholder="시리얼 시작"
                value={exportSerialStart}
                disabled={isExporting}
                onChange={(e) => setExportSerialStart(e.target.value)}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                }}
              />
              <input
                type="text"
                placeholder="시리얼 끝"
                value={exportSerialEnd}
                disabled={isExporting}
                onChange={(e) => setExportSerialEnd(e.target.value)}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                }}
              />
            </div>

            <div
              style={{
                marginBottom: 14,
                padding: "10px 12px",
                borderRadius: "8px",
                backgroundColor: "#fffbeb",
                color: "#b45309",
                border: "1px solid #fde68a",
                fontSize: "0.9rem",
                fontWeight: 600,
              }}
            >
              ※ 시리얼 범위 기준 최대 100,000건까지만 Export 가능합니다.
            </div>

            {exportMessage && (
              <div
                style={{
                  marginBottom: 14,
                  padding: "10px 12px",
                  borderRadius: "8px",
                  backgroundColor: "#ecfeff",
                  color: "#155e75",
                  border: "1px solid #a5f3fc",
                  fontWeight: 600,
                }}
              >
                {exportMessage}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                disabled={isExporting}
                onClick={() => {
                  setShowExportModal(false);
                  setExportMessage("");
                }}
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  cursor: isExporting ? "not-allowed" : "pointer",
                }}
              >
                취소
              </button>

              <button
                disabled={isExporting}
                onClick={handleExportConfirm}
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "none",
                  background: isExporting ? "#94a3b8" : "#0f766e",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: isExporting ? "not-allowed" : "pointer",
                }}
              >
                {isExporting ? "생성 중..." : "Export 확인"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProductionHistory;
