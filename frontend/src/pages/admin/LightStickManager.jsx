// src/pages/admin/LightStickManager.jsx
import { useEffect, useState } from "react";
import SERVER_ADDRESS from "../../config";
import { fetchWithAuth } from "../../utils/fetchWithAuth";

function LightStickManager() {
  const [activeTab, setActiveTab] = useState("register");

  // 공통 상태
  const [artistList, setArtistList] = useState([]);
  const [lightsticks, setLightsticks] = useState([]);
  const [message, setMessage] = useState("");

  // 등록 탭 상태
  const [lightstickInput, setLightstickInput] = useState("");
  const [selectedArtist, setSelectedArtist] = useState("");
  const [certificationInfo, setCertificationInfo] = useState("");
  const [fwVersion, setFwVersion] = useState("");
  const [material, setMaterial] = useState(""); // MATERIAL(디바이스명)
  const [modelCode, setModelCode] = useState(""); // MATERIAL CODE(모델 정보)

  // 수정 탭 상태
  const [selectedLightstick, setSelectedLightstick] = useState("");

  const tableStyle = {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: 10,
    boxShadow: "0 0 5px rgba(0, 0, 0, 0.1)",
    tableLayout: "fixed", // 🔹 셀 폭 고정
  };

  const tableWrapperStyle = {
    width: "100%",
    overflowX: "auto",
  };

  const thTdStyle = {
    border: "1px solid #ddd",
    padding: "10px",
    textAlign: "center",
    wordBreak: "break-all", // 🔹 긴 텍스트 줄바꿈
    whiteSpace: "normal",
  };

  const fetchArtists = async () => {
    try {
      const res = await fetchWithAuth(`${SERVER_ADDRESS}/api/artists`, {
        credentials: "include",
      });
      const result = await res.json();
      if (result.success) setArtistList(result.data.map((a) => a.artist));
    } catch (err) {
      console.error(err);
    }
  };

  const fetchLightsticks = async () => {
    try {
      const res = await fetchWithAuth(`${SERVER_ADDRESS}/api/lightsticks`, {
        credentials: "include",
      });
      const result = await res.json();
      if (result.success) setLightsticks(result.data);
      else {
        setLightsticks([]);
        setMessage(`❌ 조회 실패: ${result.message}`);
      }
    } catch (err) {
      console.error(err);
      setLightsticks([]);
      setMessage("❌ 서버 예외 발생");
    }
  };

  useEffect(() => {
    fetchArtists();
  }, []);

  useEffect(() => {
    setMessage("");
    if (activeTab !== "register") {
      fetchLightsticks();
    }
  }, [activeTab]);

  const handleRegister = async () => {
    if (!lightstickInput.trim() || !selectedArtist) {
      alert("아티스트 선택 및 응원봉 이름을 모두 입력해주세요.");
      return;
    }

    try {
      const res = await fetchWithAuth(`${SERVER_ADDRESS}/api/lightsticks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          lightstick: lightstickInput.trim(),
          artist: selectedArtist,
          certification_info: certificationInfo.trim(),
          fw_version: fwVersion.trim(),
          device_name: material.trim(),
          model: modelCode.trim(),
        }),
      });

      const result = await res.json();
      setMessage(result.message);

      // 입력값 초기화
      setLightstickInput("");
      setCertificationInfo("");
      setFwVersion("");
      setMaterial("");
      setModelCode("");

      // 리스트 갱신
      fetchLightsticks();
    } catch (err) {
      console.error(err);
      setMessage("❌ 등록 실패");
    }
  };

  const handleDelete = async (lightstick, artist) => {
    if (!window.confirm(`'${lightstick}'을 삭제할까요?`)) return;

    try {
      const res = await fetchWithAuth(`${SERVER_ADDRESS}/api/lightsticks`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ lightstick, artist }),
      });

      const result = await res.json();
      setMessage(result.message);
      fetchLightsticks();
    } catch (err) {
      console.error(err);
      setMessage("❌ 삭제 실패");
    }
  };

  const handleUpdate = async () => {
    if (!selectedLightstick) {
      alert("수정할 응원봉을 선택해 주세요.");
      return;
    }

    const newCertification = certificationInfo.trim();
    const newFwVersion = fwVersion.trim();
    const newDeviceName = material.trim();
    const newModel = modelCode.trim();

    try {
      const res = await fetchWithAuth(
        `${SERVER_ADDRESS}/api/lightsticks/update`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            lightstick: selectedLightstick,
            certification_info: newCertification,
            fw_version: newFwVersion,
            device_name: newDeviceName,
            model: newModel,
          }),
        }
      );

      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.message || "수정 실패");
      }

      setMessage("✅ 수정 완료");

      // 🔹 1) 목록 상태도 직접 업데이트 (즉시 화면 반영)
      setLightsticks((prev) =>
        prev.map((l) =>
          l.lightstick === selectedLightstick
            ? {
                ...l,
                certification_info: newCertification,
                fw_version: newFwVersion,
                device_name: newDeviceName,
                model: newModel,
              }
            : l
        )
      );

      // 🔹 2) 입력 필드는 지금 입력한 값 그대로 두기 때문에
      //      화면에는 '수정 후 값'이 그대로 유지됨 (별도 작업 불필요)
    } catch (err) {
      console.error("❌ 수정 실패:", err);
      setMessage(`❌ 수정 실패: ${err.message}`);
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "register":
        return (
          <div style={{ padding: "0 12px" }}>
            <h3 style={{ marginBottom: 20, fontSize: "18px" }}>응원봉 등록</h3>

            {/* 아티스트 */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontWeight: "bold",
                  marginBottom: 6,
                  display: "block",
                }}
              >
                아티스트
              </label>
              <select
                value={selectedArtist}
                onChange={(e) => setSelectedArtist(e.target.value)}
                style={{
                  padding: "10px",
                  width: "100%",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                }}
              >
                <option value="">-- 아티스트 선택 --</option>
                {artistList.map((a, i) => (
                  <option key={i} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            {/* 응원봉 이름 */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontWeight: "bold",
                  marginBottom: 6,
                  display: "block",
                }}
              >
                응원봉 이름
              </label>
              <input
                placeholder="예: AB"
                value={lightstickInput}
                onChange={(e) => setLightstickInput(e.target.value)}
                style={{
                  padding: "10px",
                  width: "100%",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                }}
              />
            </div>

            {/* MATERIAL(디바이스명) */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontWeight: "bold",
                  marginBottom: 6,
                  display: "block",
                }}
              >
                MATERIAL (디바이스명)
              </label>
              <input
                placeholder="예: AB"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                style={{
                  padding: "10px",
                  width: "100%",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                }}
              />
            </div>

            {/* MATERIAL CODE(모델 정보) */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontWeight: "bold",
                  marginBottom: 6,
                  display: "block",
                }}
              >
                MATERIAL CODE (모델 정보)
              </label>
              <input
                placeholder="예: SVFA23J0S900NN0"
                value={modelCode}
                onChange={(e) => setModelCode(e.target.value)}
                style={{
                  padding: "10px",
                  width: "100%",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                }}
              />
            </div>

            {/* FW 버전 */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontWeight: "bold",
                  marginBottom: 6,
                  display: "block",
                }}
              >
                FW 버전
              </label>
              <input
                placeholder="예: x.x"
                value={fwVersion}
                onChange={(e) => {
                  // ProductionRegister와 동일하게 숫자 + '.' 만 허용
                  let v = e.target.value.replace(/[^0-9.]/g, "");
                  const parts = v.split(".");
                  if (parts.length > 2) {
                    v =
                      parts[0] +
                      "." +
                      parts.slice(1).join("").replace(/\./g, "");
                  }
                  setFwVersion(v);
                }}
                style={{
                  padding: "10px",
                  width: "100%",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                }}
              />
            </div>

            {/* 인증 정보 */}
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  fontWeight: "bold",
                  marginBottom: 6,
                  display: "block",
                }}
              >
                인증 정보
              </label>
              <input
                placeholder="예: CMIIT ID: 2025DJ00000"
                value={certificationInfo}
                onChange={(e) => setCertificationInfo(e.target.value)}
                style={{
                  padding: "10px",
                  width: "100%",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                }}
              />
            </div>

            <button
              onClick={handleRegister}
              style={{
                padding: "10px 24px",
                backgroundColor: "#007bff",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              등록
            </button>

            {message && (
              <p style={{ marginTop: 14, color: "#007bff" }}>{message}</p>
            )}
          </div>
        );

      case "view":
        return (
          <div>
            <h3 style={{ marginBottom: 16 }}>응원봉 목록</h3>
            <div style={tableWrapperStyle}>
              <table style={tableStyle}>
                <thead style={{ backgroundColor: "#f8f9fa" }}>
                  <tr>
                    <th style={thTdStyle}>Lightstick</th>
                    <th style={thTdStyle}>Artist</th>
                    <th style={thTdStyle}>MATERIAL</th>
                    <th style={thTdStyle}>MATERIAL CODE</th>
                    <th style={thTdStyle}>FW 버전</th>
                    <th style={thTdStyle}>인증 정보</th>
                    <th style={thTdStyle}>등록일</th>
                    <th style={thTdStyle}>수정일</th>
                  </tr>
                </thead>
                <tbody>
                  {lightsticks.map((l, i) => (
                    <tr
                      key={i}
                      style={{
                        backgroundColor: i % 2 === 0 ? "#fff" : "#f2f2f2",
                      }}
                    >
                      <td style={thTdStyle}>{l.lightstick}</td>
                      <td style={thTdStyle}>{l.artist}</td>
                      <td style={thTdStyle}>{l.device_name}</td>
                      <td style={thTdStyle}>{l.model}</td>
                      <td style={thTdStyle}>{l.fw_version}</td>
                      <td style={thTdStyle}>{l.certification_info}</td>
                      <td style={thTdStyle}>
                        {new Date(l.created_at).toLocaleString()}
                      </td>
                      <td style={thTdStyle}>
                        {new Date(l.updated_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case "delete":
        return (
          <div>
            <h3 style={{ marginBottom: 16 }}>응원봉 삭제</h3>
            <div style={tableWrapperStyle}>
              <table style={tableStyle}>
                <thead style={{ backgroundColor: "#f8f9fa" }}>
                  <tr>
                    <th style={thTdStyle}>Lightstick</th>
                    <th style={thTdStyle}>삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {lightsticks.map((l, i) => (
                    <tr
                      key={i}
                      style={{
                        backgroundColor: i % 2 === 0 ? "#fff" : "#f2f2f2",
                      }}
                    >
                      <td style={thTdStyle}>{l.lightstick}</td>
                      <td style={thTdStyle}>
                        <button
                          onClick={() => handleDelete(l.lightstick, l.artist)}
                          style={{
                            padding: "6px 12px",
                            backgroundColor: "#dc3545",
                            color: "#fff",
                            border: "none",
                            borderRadius: 4,
                            cursor: "pointer",
                          }}
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {message && (
              <p style={{ marginTop: 10, color: "#dc3545" }}>{message}</p>
            )}
          </div>
        );

      case "update":
        return (
          <div style={{ padding: "0 12px" }}>
            <h3 style={{ marginBottom: 20, fontSize: "18px" }}>
              응원봉 항목 수정
            </h3>

            {/* 응원봉 선택 */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontWeight: "bold",
                  marginBottom: 6,
                  display: "block",
                }}
              >
                수정할 응원봉
              </label>
              <select
                value={selectedLightstick}
                onChange={(e) => {
                  const ls = lightsticks.find(
                    (l) => l.lightstick === e.target.value
                  );
                  setSelectedLightstick(ls?.lightstick || "");
                  setSelectedArtist(ls?.artist || "");
                  setCertificationInfo(ls?.certification_info || "");
                  setFwVersion(ls?.fw_version || "");
                  setMaterial(ls?.device_name || "");
                  setModelCode(ls?.model || "");
                }}
                style={{
                  padding: "10px",
                  width: "100%",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                }}
              >
                <option value="">-- 응원봉 선택 --</option>
                {lightsticks.map((l, i) => (
                  <option key={i} value={l.lightstick}>
                    {l.lightstick}
                  </option>
                ))}
              </select>
            </div>

            {/* MATERIAL(디바이스명) 수정 */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontWeight: "bold",
                  marginBottom: 6,
                  display: "block",
                }}
              >
                MATERIAL (디바이스명)
              </label>
              <input
                placeholder="예: AB"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                style={{
                  padding: "10px",
                  width: "100%",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                }}
              />
            </div>

            {/* MATERIAL CODE(모델 정보) 수정 */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontWeight: "bold",
                  marginBottom: 6,
                  display: "block",
                }}
              >
                MATERIAL CODE (모델 정보)
              </label>
              <input
                placeholder="예: SVFA23J0S900NN0"
                value={modelCode}
                onChange={(e) => setModelCode(e.target.value)}
                style={{
                  padding: "10px",
                  width: "100%",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                }}
              />
            </div>

            {/* FW 버전 수정 */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontWeight: "bold",
                  marginBottom: 6,
                  display: "block",
                }}
              >
                FW 버전
              </label>
              <input
                placeholder="예: x.x"
                value={fwVersion}
                onChange={(e) => {
                  let v = e.target.value.replace(/[^0-9.]/g, "");
                  const parts = v.split(".");
                  if (parts.length > 2) {
                    v =
                      parts[0] +
                      "." +
                      parts.slice(1).join("").replace(/\./g, "");
                  }
                  setFwVersion(v);
                }}
                style={{
                  padding: "10px",
                  width: "100%",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                }}
              />
            </div>

            {/* 인증 정보 수정 */}
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  fontWeight: "bold",
                  marginBottom: 6,
                  display: "block",
                }}
              >
                인증 정보
              </label>
              <input
                placeholder="예: KC, FCC"
                value={certificationInfo}
                onChange={(e) => setCertificationInfo(e.target.value)}
                style={{
                  padding: "10px",
                  width: "100%",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                }}
              />
            </div>

            <button
              onClick={handleUpdate}
              style={{
                padding: "10px 24px",
                backgroundColor: "#28a745",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              수정
            </button>

            {message && (
              <p style={{ marginTop: 14, color: "#28a745" }}>{message}</p>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ padding: 20, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 20 }}>응원봉 관리</h2>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        {["register", "view", "delete", "update"].map((tab) => (
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
            {
              {
                register: "등록",
                view: "조회",
                delete: "삭제",
                update: "수정",
              }[tab]
            }
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

export default LightStickManager;
