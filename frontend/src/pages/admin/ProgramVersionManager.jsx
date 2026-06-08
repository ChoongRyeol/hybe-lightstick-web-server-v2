// src/pages/admin/ProgramVersionManager.jsx
import { useEffect, useState } from "react";
import SERVER_ADDRESS from "../../config";
import { fetchWithAuth } from "../../utils/fetchWithAuth";

const PROGRAMS = [
  "FWMonitorTool",
  "MacWriteToolV2",
  "LabelPrintToolV2",
  "MacCheckTool",
];

function ProgramVersionManager() {
  const [activeTab, setActiveTab] = useState("upsert");
  const [message, setMessage] = useState("");

  // 폼
  const [programName, setProgramName] = useState(PROGRAMS[0]);
  const [latestVersion, setLatestVersion] = useState("");
  const [isForceUpdate, setIsForceUpdate] = useState(true); // “무조건 최신”이면 기본 true 추천
  const [releaseNote, setReleaseNote] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");

  // 조회 데이터
  const [programList, setProgramList] = useState([]);

  const tableStyle = {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: 10,
    boxShadow: "0 0 5px rgba(0,0,0,0.1)",
  };

  const thTdStyle = {
    border: "1px solid #ddd",
    padding: "10px",
    textAlign: "center",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  };

  const tdLeftStyle = {
    ...thTdStyle,
    textAlign: "left",
    whiteSpace: "normal",
    wordBreak: "break-all",
  };

  // 버전: x.x.x (3자리 고정)
  const validateVersion = (v) => /^\d+\.\d+\.\d+$/.test(v.trim());

  // ✅ 단일 조회 (silent=true면 실패 메시지 표시 안 함)
  const fetchOneVersion = async (pname, { silent = false } = {}) => {
    try {
      const res = await fetchWithAuth(
        `${SERVER_ADDRESS}/api/program/version?program=${encodeURIComponent(pname)}`,
        { credentials: "include" },
      );

      if (!res.ok) {
        if (res.status === 404) {
          if (!silent)
            setMessage("ℹ️ 아직 등록된 버전이 없습니다. 저장하세요.");
          setLatestVersion("");
          setReleaseNote("");
          setDownloadUrl("");
          setIsForceUpdate(true);
          return;
        }

        if (!silent) setMessage(`❌ 조회 실패: HTTP ${res.status}`);
        return;
      }

      const result = await res.json();
      console.log("[ProgramVersion] raw response:", result);

      // ✅ 핵심: 랩핑 해제
      const data = result?.data ?? result;

      if (data && data.program_name) {
        setLatestVersion(data.latest_version ?? "");
        setIsForceUpdate(!!data.is_force_update);
        setReleaseNote(data.release_note ?? "");
        setDownloadUrl(data.download_url ?? "");
        if (!silent) setMessage("✅ 로드 완료");
      } else {
        if (!silent) setMessage("❌ 등록된 정보가 없습니다.");
      }
    } catch (err) {
      console.error(err);
      if (!silent) setMessage("❌ 단일 조회 실패");
    }
  };

  // ✅ 전체 목록 조회 (서버에 GET /api/program/versions 필요)
  const fetchAllVersions = async () => {
    try {
      const res = await fetchWithAuth(
        `${SERVER_ADDRESS}/api/program/versions`,
        {
          credentials: "include",
        },
      );

      if (!res.ok) {
        setProgramList([]);
        setMessage(`❌ 조회 실패: HTTP ${res.status}`);
        return;
      }

      const result = await res.json();
      if (result.success) setProgramList(result.data);
      else {
        setProgramList([]);
        setMessage(`❌ 조회 실패: ${result.message}`);
      }
    } catch (err) {
      console.error(err);
      setProgramList([]);
      setMessage("❌ 서버 예외 발생");
    }
  };

  // ✅ 초기 진입 시 “자동 로드”는 조용히(silent) 처리 → 메시지 안 뜸
  useEffect(() => {
    setMessage("");
    if (activeTab === "upsert") {
      fetchOneVersion(programName, { silent: true });
    } else if (activeTab === "view") {
      fetchAllVersions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ✅ 프로그램 변경 시 즉시 로드 (이건 사용자 액션이므로 silent=false)
  useEffect(() => {
    if (activeTab === "upsert") {
      setMessage("");
      fetchOneVersion(programName, { silent: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programName]);

  // ✅ 저장(업서트) - min_required_version은 “최신과 동일”로 서버에 같이 보냄
  const handleUpsert = async () => {
    if (!programName.trim()) {
      alert("프로그램명을 선택하세요.");
      return;
    }
    if (!latestVersion.trim()) {
      alert("latest_version을 입력하세요.");
      return;
    }
    if (!validateVersion(latestVersion)) {
      alert("버전 형식이 올바르지 않습니다. 예: 2.0.0 (x.x.x)");
      return;
    }
    if (!downloadUrl.trim()) {
      alert("다운로드 URL(zip)을 입력하세요.");
      return;
    }

    try {
      const res = await fetchWithAuth(`${SERVER_ADDRESS}/api/program/version`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          program_name: programName.trim(),
          latest_version: latestVersion.trim(),
          // ✅ 무조건 최신만 쓰므로 min_required는 latest와 동일 취급
          min_required_version: latestVersion.trim(),
          is_force_update: isForceUpdate ? 1 : 0,
          release_note: releaseNote.trim(),
          download_url: downloadUrl.trim(),
        }),
      });

      if (!res.ok) {
        setMessage(`❌ 저장 실패: HTTP ${res.status}`);
        return;
      }

      const result = await res.json();
      if (result.success || result.ok) {
        setMessage("✅ 저장 완료");
        if (activeTab === "view") fetchAllVersions();
      } else {
        setMessage(`❌ 저장 실패: ${result.message ?? "unknown"}`);
      }
    } catch (err) {
      console.error(err);
      setMessage("❌ 저장 실패(서버 예외)");
    }
  };
  // ✅ 수동 푸시 날리기
  const handlePush = async () => {
    if (!programName) {
      alert("프로그램명을 선택하세요.");
      return;
    }

    try {
      const res = await fetchWithAuth(
        `${SERVER_ADDRESS}/api/program/version/push`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            program_name: programName,
          }),
        },
      );

      if (!res.ok) {
        setMessage(`❌ 푸시 실패: HTTP ${res.status}`);
        return;
      }

      const result = await res.json();
      if (result.success || result.ok) {
        setMessage("📣 버전 푸시 알림 전송 완료");
      } else {
        setMessage(`❌ 푸시 실패: ${result.message ?? "unknown"}`);
      }
    } catch (err) {
      console.error(err);
      setMessage("❌ 푸시 전송 중 서버 오류");
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "upsert":
        return (
          <div style={{ padding: "0 12px" }}>
            <h3 style={{ marginBottom: 20, fontSize: "18px" }}>
              🧩 프로그램 버전 등록/수정
            </h3>

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontWeight: "bold",
                  marginBottom: 6,
                  display: "block",
                }}
              >
                프로그램명
              </label>

              <select
                value={programName}
                onChange={(e) => setProgramName(e.target.value)}
                style={{
                  padding: "10px",
                  borderRadius: 6,
                  width: "100%",
                  border: "1px solid #ccc",
                }}
              >
                {PROGRAMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontWeight: "bold",
                  marginBottom: 6,
                  display: "block",
                }}
              >
                최신 버전 — 형식: x.x.x.x
              </label>
              <input
                placeholder="예: 1.4.0.0"
                value={latestVersion}
                onChange={(e) => setLatestVersion(e.target.value)}
                style={{
                  padding: "10px",
                  width: "100%",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontWeight: "bold",
                  marginBottom: 6,
                  display: "block",
                }}
              >
                공정 프로그램 다운로드 경로
              </label>
              <input
                placeholder="예: 서버 폴더 경로"
                value={downloadUrl}
                onChange={(e) => setDownloadUrl(e.target.value)}
                style={{
                  padding: "10px",
                  width: "100%",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontWeight: "bold",
                  marginBottom: 6,
                  display: "block",
                }}
              >
                릴리즈 노트
              </label>
              <textarea
                placeholder="예: 중복 처리 개선"
                value={releaseNote}
                onChange={(e) => setReleaseNote(e.target.value)}
                rows={3}
                style={{
                  padding: "10px",
                  width: "100%",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  resize: "vertical",
                }}
              />
            </div>

            <div
              style={{
                marginBottom: 16,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <input
                type="checkbox"
                checked={isForceUpdate}
                onChange={(e) => setIsForceUpdate(e.target.checked)}
              />
              <span style={{ fontWeight: "bold" }}>강제 업데이트</span>
              <span style={{ fontSize: 12, color: "#666" }}>
                * “무조건 최신 사용” 정책
              </span>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={handleUpsert}
                style={{
                  padding: "10px 24px",
                  backgroundColor: "#007bff",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                저장
              </button>

              <button
                onClick={() => fetchOneVersion(programName, { silent: false })}
                style={{
                  padding: "10px 24px",
                  backgroundColor: "#6c757d",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                불러오기
              </button>

              {/* ✅ NEW: 푸시 버튼 */}
              <button
                onClick={handlePush}
                style={{
                  padding: "10px 24px",
                  backgroundColor: "#dc3545",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                📣 푸시 날리기
              </button>
            </div>

            {message && (
              <p
                style={{
                  marginTop: 12,
                  color: "#007bff",
                  whiteSpace: "pre-wrap",
                }}
              >
                {message}
              </p>
            )}
          </div>
        );

      case "view":
        return (
          <div>
            <h3 style={{ marginBottom: 16 }}>📋 프로그램 버전 목록</h3>

            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <button
                onClick={fetchAllVersions}
                style={{
                  padding: "8px 14px",
                  backgroundColor: "#28a745",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                새로고침
              </button>
            </div>

            <table style={tableStyle}>
              <thead style={{ backgroundColor: "#f8f9fa" }}>
                <tr>
                  <th style={thTdStyle}>Program</th>
                  <th style={thTdStyle}>Latest</th>
                  <th style={thTdStyle}>Force</th>
                  <th style={thTdStyle}>Download</th>
                  <th style={thTdStyle}>Note</th>
                  <th style={thTdStyle}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {programList.map((p, i) => (
                  <tr
                    key={p.program_name ?? i}
                    style={{
                      backgroundColor: i % 2 === 0 ? "#fff" : "#f2f2f2",
                    }}
                  >
                    <td style={thTdStyle}>{p.program_name}</td>
                    <td style={thTdStyle}>{p.latest_version}</td>
                    <td style={thTdStyle}>
                      {p.is_force_update ? "YES" : "NO"}
                    </td>
                    <td style={tdLeftStyle}>
                      {p.download_url ? (
                        <a
                          href={p.download_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {p.download_url}
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td style={tdLeftStyle}>{p.release_note ?? "-"}</td>
                    <td style={thTdStyle}>
                      {p.updated_at
                        ? new Date(p.updated_at).toLocaleString()
                        : "-"}
                    </td>
                  </tr>
                ))}

                {programList.length === 0 && (
                  <tr>
                    <td style={thTdStyle} colSpan={6}>
                      데이터 없음
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {message && (
              <p style={{ marginTop: 10, color: "#dc3545" }}>{message}</p>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ padding: 20, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 20 }}>프로그램 버전 관리</h2>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        {["upsert", "view"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: "6px",
              border:
                activeTab === tab ? "2px solid #007bff" : "1px solid #ccc",
              backgroundColor: activeTab === tab ? "#eaf1ff" : "#fff",
              fontWeight: activeTab === tab ? "bold" : "normal",
              cursor: "pointer",
            }}
          >
            {{ upsert: "등록/수정", view: "조회" }[tab]}
          </button>
        ))}
      </div>

      <div
        style={{
          backgroundColor: "#fff",
          padding: 20,
          borderRadius: 8,
          border: "1px solid #ddd",
          boxShadow: "0 0 8px #eee",
        }}
      >
        {renderTabContent()}
      </div>
    </div>
  );
}

export default ProgramVersionManager;
