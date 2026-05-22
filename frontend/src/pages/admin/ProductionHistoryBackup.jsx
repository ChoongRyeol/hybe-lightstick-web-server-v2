// src/pages/admin/ProductionHistoryBackup.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import SERVER_ADDRESS from "../../config";
import { fetchWithAuth } from "../../utils/fetchWithAuth";

const LIMIT = 20;

function ProductionHistoryBackup() {
  const navigate = useNavigate();

  const [summaryList, setSummaryList] = useState([]);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // ✅ 병합만 지원
  const [selectedGenerators, setSelectedGenerators] = useState([]);
  const [mergeName, setMergeName] = useState("");

  const fetchSummary = async () => {
    try {
      const res = await fetchWithAuth(
        `${SERVER_ADDRESS}/api/backup/range-summary?page=${page}&limit=${LIMIT}`,
      );
      const result = await res.json();

      if (result.success) {
        setSummaryList(result.data || []);
        setTotalCount(result.totalCount ?? 0);
      } else {
        alert("데이터 조회 실패");
      }
    } catch (err) {
      console.error("❌ 백업 데이터 조회 오류:", err);
      alert("서버 오류");
    }
  };

  useEffect(() => {
    fetchSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const totalPages = Math.ceil(totalCount / LIMIT);

  // ✅ 현재 페이지에 있는 generator 목록
  const pageGeneratorNames = useMemo(
    () => (summaryList || []).map((x) => x.generator_name).filter(Boolean),
    [summaryList],
  );

  // ✅ 현재 페이지 전체 선택 여부
  const isAllCheckedOnPage = useMemo(() => {
    if (pageGeneratorNames.length === 0) return false;
    return pageGeneratorNames.every((g) => selectedGenerators.includes(g));
  }, [pageGeneratorNames, selectedGenerators]);

  // ✅ 병합 가능 여부 (원본 페이지와 동일한 정책)
  const isMergeable = () => {
    if (selectedGenerators.length < 2) return false;

    const target = String(mergeName || "").trim();
    if (!target) return false;

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

    // ✅ 현재 페이지 기준으로만 검증하므로, 선택이 페이지 밖까지 포함되면 서버에서 다시 검증됨
    if (!isMergeable()) {
      alert("같은 아티스트와 응원봉만 병합 가능합니다.");
      return;
    }

    if (
      !window.confirm(
        `선택된 ${sources.length}개 백업 이력을 '${target}'로 병합하시겠습니까?`,
      )
    )
      return;

    try {
      const res = await fetchWithAuth(`${SERVER_ADDRESS}/api/backup/merge`, {
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: "16px",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.8rem", color: "#333" }}>
          🧊 백업 생산 관리 조회 (병합만)
        </h2>

        <button
          onClick={() => navigate("/backup")}
          style={{
            padding: "8px 14px",
            borderRadius: "8px",
            backgroundColor: "#111827",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            fontWeight: 700,
          }}
          title="모니터링 페이지로 이동"
        >
          📊 모니터링 페이지로 이동
        </button>
      </div>

      <div
        style={{
          background: "#fff",
          padding: "20px",
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          width: "100%",
          overflowX: "auto",
        }}
      >
        {/* ✅ 병합 컨트롤 (상단) */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          <input
            type="text"
            placeholder="새 생산명 입력"
            value={mergeName}
            onChange={(e) => setMergeName(e.target.value)}
            style={{
              padding: "8px 10px",
              borderRadius: "6px",
              border: "1px solid #ccc",
              minWidth: 220,
            }}
          />

          <button
            disabled={!isMergeable()}
            onClick={handleMerge}
            style={{
              padding: "8px 14px",
              borderRadius: "8px",
              backgroundColor: "#4caf50",
              color: "#fff",
              border: "none",
              cursor: !isMergeable() ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            선택 항목 병합
          </button>

          <button
            disabled={selectedGenerators.length === 0}
            onClick={() => setSelectedGenerators([])}
            style={{
              marginLeft: "auto",
              padding: "8px 14px",
              borderRadius: "8px",
              backgroundColor:
                selectedGenerators.length === 0 ? "#ddd" : "#eee",
              color: "#333",
              border: "1px solid #ddd",
              cursor:
                selectedGenerators.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            선택 해제
          </button>

          <span style={{ color: "#666", fontSize: 13 }}>
            선택 {selectedGenerators.length}개
          </span>
        </div>

        <table
          style={{
            width: "100%",
            minWidth: "1100px",
            borderCollapse: "collapse",
            fontFamily: "monospace",
            textAlign: "center",
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
              <th style={{ padding: "10px" }}>
                <input
                  type="checkbox"
                  checked={isAllCheckedOnPage}
                  onChange={(e) => {
                    const checked = e.target.checked;

                    setSelectedGenerators((prev) => {
                      const prevSet = new Set(prev);

                      if (checked) {
                        // 현재 페이지 모두 추가
                        for (const g of pageGeneratorNames) prevSet.add(g);
                      } else {
                        // 현재 페이지 모두 제거
                        for (const g of pageGeneratorNames) prevSet.delete(g);
                      }

                      return Array.from(prevSet);
                    });
                  }}
                  title="현재 페이지 전체 선택"
                />
              </th>

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
            </tr>
          </thead>

          <tbody>
            {summaryList.map((item, idx) => {
              const createdDate = item.created_at
                ? new Date(item.created_at.replace(" ", "T")).toLocaleString(
                    "ko-KR",
                  )
                : "-";

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
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* ✅ 페이징 */}
        <div
          style={{
            marginTop: "20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              backgroundColor: "#e0e0e0",
              border: "none",
              cursor: page === 0 ? "not-allowed" : "pointer",
            }}
          >
            ◀ 이전
          </button>

          <span style={{ fontWeight: "500" }}>
            페이지 {page + 1} / {totalPages || 1}
          </span>

          <button
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              backgroundColor: "#e0e0e0",
              border: "none",
              cursor: page + 1 >= totalPages ? "not-allowed" : "pointer",
            }}
          >
            다음 ▶
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProductionHistoryBackup;
