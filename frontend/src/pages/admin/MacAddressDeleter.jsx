import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SERVER_ADDRESS from "../../config";

function MacAddressDeleter() {
  const [mac, setMac] = useState("");
  const [selectedProcess, setSelectedProcess] = useState("");
  const [message, setMessage] = useState("");
  const [searchParams] = useSearchParams();

  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);

  const tableMap = {
    write: "process_device_test",
    generated: "process_generated_macs",
  };

  useEffect(() => {
    const preselectedTable = searchParams.get("table");
    if (preselectedTable) {
      const matched = Object.entries(tableMap).find(
        ([key, val]) => val === preselectedTable,
      );
      if (matched) setSelectedProcess(matched[0]);
    }

    const prefilledMac = searchParams.get("mac");
    if (prefilledMac) setMac(prefilledMac);
  }, [searchParams]);

  const handleDelete = async () => {
    if (!mac || !selectedProcess) {
      alert("MAC 주소와 공정을 모두 입력하세요.");
      return;
    }

    const table = tableMap[selectedProcess];
    if (!table) {
      alert("선택된 공정에 해당하는 테이블이 없습니다.");
      return;
    }

    try {
      const res = await fetch(`${SERVER_ADDRESS}/api/mac/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          mac_address: mac,
          table,
        }),
      });

      const result = await res.json();
      setMessage(
        result.success ? "✅ 삭제 완료" : `❌ 삭제 실패: ${result.message}`,
      );
    } catch (err) {
      setMessage("❌ 삭제 요청 중 오류 발생");
      console.error(err);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch(`${SERVER_ADDRESS}/api/mac/deleted-logs`, {
        credentials: "include",
      });
      const result = await res.json();
      if (result.success) {
        setLogs(result.logs);
        setShowLogs(true);
      } else {
        alert("삭제 로그 조회 실패");
      }
    } catch (err) {
      console.error("삭제 로그 오류:", err);
      alert("서버 오류");
    }
  };

  return (
    <div
      style={{
        padding: "24px",
        fontFamily: "Segoe UI, sans-serif",
        backgroundColor: "#f9fafb",
      }}
    >
      <h2 style={{ marginBottom: "16px", fontSize: "1.8rem", color: "#333" }}>
        🗑️ MAC 주소 삭제
      </h2>

      <div style={{ display: "flex", gap: "32px", alignItems: "flex-start" }}>
        {/* 삭제 입력 영역 */}
        <div
          style={{
            flex: 1,
            background: "#fff",
            padding: "20px",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <label
              style={{ fontWeight: "600", display: "block", marginBottom: 6 }}
            >
              공정 선택
            </label>
            <select
              value={selectedProcess}
              onChange={(e) => setSelectedProcess(e.target.value)}
              style={{
                width: "100%",
                padding: "8px",
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
            >
              <option value="">-- 공정 선택 --</option>
              <option value="write">MAC Write 공정</option>
              <option value="generated">MAC 생성 공정</option>
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label
              style={{ fontWeight: "600", display: "block", marginBottom: 6 }}
            >
              MAC 주소
            </label>
            <input
              type="text"
              placeholder="예: 80:DE:CC:00:00:01"
              value={mac}
              onChange={(e) => setMac(e.target.value)}
              style={{
                width: "100%",
                padding: "8px",
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
            />
          </div>

          <button
            onClick={handleDelete}
            style={{
              padding: "10px 20px",
              backgroundColor: "#dc3545",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            삭제
          </button>

          {message && (
            <p
              style={{
                marginTop: 12,
                color: message.startsWith("✅") ? "green" : "red",
              }}
            >
              {message}
            </p>
          )}
        </div>

        {/* 삭제 로그 영역 */}
        <div
          style={{
            flex: 2,
            background: "#fff",
            padding: "20px",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <h4 style={{ margin: 0 }}>🗂️ 삭제 로그</h4>
            <button onClick={fetchLogs} style={{ padding: "6px 12px" }}>
              조회
            </button>
          </div>

          {showLogs && (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "#f1f1f1", textAlign: "left" }}>
                  <th
                    style={{ padding: "8px", borderBottom: "1px solid #ddd" }}
                  >
                    MAC
                  </th>
                  <th
                    style={{ padding: "8px", borderBottom: "1px solid #ddd" }}
                  >
                    공정
                  </th>
                  <th
                    style={{ padding: "8px", borderBottom: "1px solid #ddd" }}
                  >
                    삭제자
                  </th>
                  <th
                    style={{ padding: "8px", borderBottom: "1px solid #ddd" }}
                  >
                    삭제 시각
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => {
                  const tableNameMap = {
                    process_device_test: "Device Test 공정",
                    process_generated_macs: "MAC 생성 공정",
                  };

                  return (
                    <tr key={i}>
                      <td
                        style={{
                          padding: "8px",
                          borderBottom: "1px solid #eee",
                        }}
                      >
                        {log.mac_address}
                      </td>
                      <td
                        style={{
                          padding: "8px",
                          borderBottom: "1px solid #eee",
                        }}
                      >
                        {tableNameMap[log.deleted_table] || log.deleted_table}
                      </td>
                      <td
                        style={{
                          padding: "8px",
                          borderBottom: "1px solid #eee",
                        }}
                      >
                        {log.deleted_by}
                      </td>
                      <td
                        style={{
                          padding: "8px",
                          borderBottom: "1px solid #eee",
                        }}
                      >
                        {new Date(log.deleted_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default MacAddressDeleter;
