// src/pages/admin/ProductionEditor.jsx
import { useEffect, useState } from "react";
import SERVER_ADDRESS from "../../config";
import { fetchWithAuth } from "../../utils/fetchWithAuth";

function ProductionEditor() {
  const [generatorList, setGeneratorList] = useState([]);
  const [selectedGenerator, setSelectedGenerator] = useState(null);
  const [artists, setArtists] = useState([]);
  const [lightsticks, setLightsticks] = useState([]);

  const [artist, setArtist] = useState("");
  const [lightstick, setLightstick] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [fwVersion, setFwVersion] = useState("");
  const [model, setModel] = useState("");
  const [certificationInfo, setCertificationInfo] = useState("");
  const [generatorName, setGeneratorName] = useState("");
  const [message, setMessage] = useState("");

  // ✅ 시작/끝 MAC 범위
  const [startMac, setStartMac] = useState("");
  const [endMac, setEndMac] = useState("");

  // ✅ 저장 중 로딩 상태
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchSummary();
    fetchArtists();
  }, []);

  const fetchSummary = async () => {
    try {
      const res = await fetchWithAuth(
        `${SERVER_ADDRESS}/api/generated/range-summary`,
      );
      const result = await res.json();
      if (res.ok && result.success) setGeneratorList(result.data);
    } catch (err) {
      console.error("❌ 목록 로딩 오류", err);
    }
  };

  const fetchArtists = async () => {
    try {
      const res = await fetchWithAuth(`${SERVER_ADDRESS}/api/artists`);
      const result = await res.json();
      if (res.ok && result.success) setArtists(result.data);
    } catch (err) {
      console.error("❌ 아티스트 로딩 오류", err);
    }
  };

  const fetchLightsticks = async (artistName) => {
    try {
      const res = await fetchWithAuth(
        `${SERVER_ADDRESS}/api/lightsticks?artist=${encodeURIComponent(
          artistName,
        )}`,
      );
      const result = await res.json();
      if (res.ok && result.success) setLightsticks(result.data);
    } catch (err) {
      console.error("❌ 응원봉 로딩 오류", err);
    }
  };

  const handleSelect = (item) => {
    setSelectedGenerator(item);
    setGeneratorName(item.generator_name);
    setArtist(item.artist);
    setLightstick(item.lightstick);
    setDeviceName(item.device_name);
    setFwVersion(item.fw_version);
    setModel(item.model);
    setCertificationInfo(item.certification_info || "");

    // ✅ range-summary 결과에 start_mac / end_mac가 있다고 가정
    setStartMac(item.start_mac || "");
    setEndMac(item.end_mac || "");

    fetchLightsticks(item.artist).then(() => {
      setTimeout(() => setLightstick(item.lightstick), 0);
    });

    setMessage("");
  };

  const handleSave = async () => {
    if (!selectedGenerator) {
      setMessage("⚠️ 먼저 왼쪽에서 생산 관리명을 선택하세요.");
      return;
    }

    if (!window.confirm("변경 내용을 저장하시겠습니까?")) {
      setMessage("ℹ️ 저장이 취소되었습니다.");
      return;
    }

    // 생산 관리명 중복 체크
    const isRenameAttempt = generatorName !== selectedGenerator?.generator_name;

    // 생산 관리명 중복 체크는 "리네임 시도"일 때만
    if (
      isRenameAttempt &&
      generatorList.some(
        (g) =>
          g.generator_name === generatorName &&
          g.generator_name !== selectedGenerator?.generator_name,
      )
    ) {
      setMessage("❌ 이미 존재하는 생산명입니다");
      return;
    }

    // 필수값 간단 체크 (선택)
    if (!artist || !lightstick || !generatorName) {
      setMessage("⚠️ 아티스트 / 응원봉 / 생산 관리명을 모두 입력하세요.");
      return;
    }

    setIsSaving(true);
    setMessage("");

    try {
      const res = await fetchWithAuth(
        `${SERVER_ADDRESS}/api/generated/update`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            old_generator_name: selectedGenerator.generator_name,
            generator_name: generatorName,
            artist,
            lightstick,
            device_name: deviceName,
            fw_version: fwVersion,
            model,
            // ✅ MAC 범위 함께 전송
            //  start_mac: startMac || null,
            //   end_mac: endMac || null,
            start_mac: null,
            end_mac: null,
            // 인증 정보는 읽기 전용이지만, 기존 값은 유지되도록 항상 포함
            certification_info:
              certificationInfo || selectedGenerator?.certification_info || "",
          }),
        },
      );

      const result = await res.json();
      if (res.ok && result.success) {
        setMessage("✅ 수정 완료");
        await fetchSummary();
      } else {
        setMessage(`❌ 수정 실패: ${result.message || "알 수 없는 오류"}`);
      }
    } catch (err) {
      console.error("❌ 저장 오류", err);
      setMessage("❌ 저장 실패: 서버 오류");
    } finally {
      setIsSaving(false);
    }
  };

  const isChanged = (field, value) => {
    if (!selectedGenerator) return false;

    if (field === "start_mac") {
      return (selectedGenerator.start_mac || "") !== (value || "");
    }
    if (field === "end_mac") {
      return (selectedGenerator.end_mac || "") !== (value || "");
    }

    return selectedGenerator?.[field] !== value;
  };

  return (
    <div
      style={{
        padding: 0,
        width: "100vw",
        height: "calc(100vh - 40px)",
        display: "flex",
      }}
    >
      {/* 좌측: 목록 */}
      <div
        style={{
          flex: 1,
          borderRight: "1px solid #ddd",
          padding: 20,
          overflowY: "auto",
        }}
      >
        <h2 style={{ marginBottom: 20, fontWeight: "bold" }}>
          📋 생산 관리 목록
        </h2>
        <ul
          style={{
            border: "1px solid #ccc",
            borderRadius: 6,
            padding: 0,
            listStyle: "none",
            fontSize: 14,
          }}
        >
          {generatorList.map((item) => (
            <li
              key={item.generator_name}
              onClick={() => !isSaving && handleSelect(item)}
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid #eee",
                backgroundColor:
                  selectedGenerator?.generator_name === item.generator_name
                    ? "#eaf1ff"
                    : "white",
                cursor: isSaving ? "not-allowed" : "pointer",
                fontWeight: "bold",
                display: "flex",
                flexDirection: "column",
                opacity: isSaving ? 0.7 : 1,
              }}
            >
              <span>{item.generator_name}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 우측: 수정 패널 */}
      <div style={{ flex: 1.5, padding: 20, overflowY: "auto" }}>
        <h2 style={{ marginBottom: 20, fontWeight: "bold" }}>
          ✏️ 선택 항목 수정
        </h2>

        {[
          {
            label: "생산 관리명",
            value: generatorName,
            setter: setGeneratorName,
            field: "generator_name",
          },
          {
            label: "아티스트",
            value: artist,
            setter: setArtist,
            field: "artist",
            type: "select",
            options: artists.map((a) => a.artist),
            onChange: (val) => {
              setArtist(val);
              fetchLightsticks(val);
            },
          },
          {
            label: "응원봉",
            value: lightstick,
            setter: setLightstick,
            field: "lightstick",
            type: "select",
            options: lightsticks.map((l) => l.lightstick),
          },
          {
            label: "시작 MAC 주소",
            value: startMac,
            setter: setStartMac,
            field: "start_mac",
          },
          {
            label: "마지막 MAC 주소",
            value: endMac,
            setter: setEndMac,
            field: "end_mac",
          },
          {
            label: "MATERIAL(디바이스명)",
            value: deviceName,
            setter: setDeviceName,
            field: "device_name",
          },
          {
            label: "FW 버전",
            value: fwVersion,
            setter: setFwVersion,
            field: "fw_version",
          },
          {
            label: "MATERIAL(디바이스명)",
            value: model,
            setter: setModel,
            field: "model",
          },
          {
            label: "라벨 인증 정보",
            value: certificationInfo,
            field: "certification_info",
            type: "readonly",
          },
        ].map(({ label, value, setter, field, type, options, onChange }, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <label style={{ fontWeight: "bold" }}>{label}</label>
            {type === "select" ? (
              <select
                value={value}
                onChange={(e) =>
                  onChange ? onChange(e.target.value) : setter(e.target.value)
                }
                disabled={isSaving}
                style={{
                  width: "100%",
                  padding: 8,
                  marginTop: 4,
                  backgroundColor: isChanged(field, value)
                    ? "#fff4ce"
                    : "white",
                  border: "1px solid #ccc",
                  opacity: isSaving ? 0.7 : 1,
                }}
              >
                <option value="">선택</option>
                {options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : type === "readonly" ? (
              <div
                style={{
                  width: "100%",
                  padding: 8,
                  marginTop: 4,
                  border: "1px solid #ddd",
                  borderRadius: 4,
                  background: "#f8f9fb",
                  color: "#333",
                  whiteSpace: "pre-wrap",
                  minHeight: 38,
                }}
                title="읽기 전용"
              >
                {value || "-"}
              </div>
            ) : (
              <input
                value={value}
                onChange={(e) => {
                  let newValue = e.target.value;
                  // ✅ start/end mac은 수정 불가
                  if (field === "start_mac" || field === "end_mac") return;

                  // ✅ FW 버전만 숫자/점(.) 허용
                  if (field === "fw_version") {
                    newValue = newValue.replace(/[^0-9.]/g, "");
                    const firstDot = newValue.indexOf(".");
                    if (firstDot !== -1) {
                      const head = newValue.slice(0, firstDot + 1);
                      const tail = newValue
                        .slice(firstDot + 1)
                        .replace(/\./g, "");
                      newValue = head + tail;
                    }
                    if (newValue.startsWith(".")) newValue = "0" + newValue;
                  }

                  setter(newValue);
                }}
                disabled={isSaving}
                style={{
                  width: "100%",
                  padding: 8,
                  marginTop: 4,
                  backgroundColor: isChanged(field, value)
                    ? "#fff4ce"
                    : "white",
                  border: "1px solid #ccc",
                  opacity: isSaving ? 0.7 : 1,
                }}
              />
            )}
          </div>
        ))}

        <button
          onClick={handleSave}
          disabled={isSaving || !selectedGenerator}
          style={{
            marginTop: 20,
            padding: "10px 24px",
            backgroundColor: isSaving ? "#6c757d" : "#007bff",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: isSaving || !selectedGenerator ? "not-allowed" : "pointer",
            opacity: isSaving ? 0.8 : 1,
          }}
        >
          {isSaving ? "저장 중..." : "저장"}
        </button>

        {isSaving && (
          <p style={{ marginTop: 8, fontSize: 13, color: "#555" }}>
            ⏳ 저장 중입니다. 잠시만 기다려 주세요...
          </p>
        )}

        {message && (
          <p style={{ marginTop: 12, fontSize: 14, whiteSpace: "pre-wrap" }}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

export default ProductionEditor;
