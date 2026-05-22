// src/pages/admin/ProductionRegister.jsx
import { useEffect, useState, useMemo } from "react";
import { FixedSizeList as VirtualList } from "react-window";
import SERVER_ADDRESS from "../../config";
import { fetchWithAuth } from "../../utils/fetchWithAuth";

const limit = 10000;
const macSuffixToInt = (mac) => parseInt(mac.replace(/:/g, "").slice(6), 16);

function ProductionRegister() {
  const [lightstick, setLightstick] = useState("");
  const [artist, setArtist] = useState("");
  const [artists, setArtists] = useState([]);
  const [lightsticks, setLightsticks] = useState([]);
  const [startMac, setStartMac] = useState("");
  const [endMac, setEndMac] = useState("");
  const [startSerial, setStartSerial] = useState("");
  const [generatorName, setGeneratorName] = useState("");
  const [generatedList, setGeneratedList] = useState([]);
  const [selectedMacs, setSelectedMacs] = useState([]);
  const [rangeStartIndex, setRangeStartIndex] = useState(null);
  const [fwVersion, setFwVersion] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [model, setModel] = useState("");
  const [certification_info, setCertificationInfo] = useState("");
  const [autoLock, setAutoLock] = useState(true); // 자동 채움 잠금 (읽기 전용)

  // ✅ 저장 로딩 상태
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchArtists();
  }, []);

  const fetchArtists = async () => {
    try {
      const res = await fetchWithAuth(`${SERVER_ADDRESS}/api/artists`, {
        credentials: "include",
      });
      const result = await res.json();
      if (res.ok && result.success && Array.isArray(result.data)) {
        setArtists(result.data);
      } else {
        throw new Error(result.message || "아티스트 목록 불러오기 실패");
      }
    } catch (err) {
      console.error("❌ 아티스트 목록 오류:", err);
      alert("아티스트 목록을 불러오는 중 오류 발생");
    }
  };

  const fetchLightsticks = async (selectedArtist) => {
    try {
      const res = await fetchWithAuth(
        `${SERVER_ADDRESS}/api/lightsticks?artist=${encodeURIComponent(
          selectedArtist,
        )}`,
        {
          credentials: "include",
        },
      );
      const result = await res.json();
      if (res.ok && result.success && Array.isArray(result.data)) {
        setLightsticks(result.data);
      } else {
        throw new Error(result.message || "응원봉 목록 불러오기 실패");
      }
    } catch (err) {
      console.error("❌ 응원봉 목록 오류:", err);
      alert("응원봉 목록을 불러오는 중 오류 발생");
    }
  };

  const [page, setPage] = useState(0);
  const pagedList = useMemo(() => {
    const start = page * limit;
    const end = start + limit;
    return generatedList.slice(start, end);
  }, [generatedList, page]);

  const intToMac = (prefix, suffixInt) => {
    const hex = suffixInt.toString(16).padStart(6, "0");
    const suffix = hex.match(/.{1,2}/g).join(":");
    return `${prefix}:${suffix}`.toUpperCase();
  };

  const handleLightstickChange = (value) => {
    if (!artist || artist === "") {
      alert("먼저 Artist를 선택하세요.");
      return;
    }

    setLightstick(value);

    // 🔹 같은 artist + lightstick 우선 매칭 (fallback으로 lightstick만)
    const selected =
      lightsticks.find((l) => l.lightstick === value && l.artist === artist) ||
      lightsticks.find((l) => l.lightstick === value);

    if (selected) {
      setCertificationInfo(selected.certification_info || "");
      setFwVersion(selected.fw_version || "");
      setDeviceName(selected.device_name || "");
      setModel(selected.model || "");
    } else {
      setCertificationInfo("");
      setFwVersion("");
      setDeviceName("");
      setModel("");
    }
  };

  const handleArtistChange = (value) => {
    setArtist(value);
    setLightstick(""); // 🔹 아티스트 바뀌면 응원봉/필드 리셋
    setCertificationInfo("");
    setFwVersion("");
    setDeviceName("");
    setModel("");
    fetchLightsticks(value);
  };

  const handleFetchLastSerial = async () => {
    if (!lightstick) {
      alert("먼저 Lightstick를 입력하세요.");
      return;
    }

    if (!artist) {
      alert("Artist를 입력하세요.");
      return;
    }

    try {
      const res = await fetchWithAuth(
        `${SERVER_ADDRESS}/api/generated/last-serial?lightstick=${encodeURIComponent(
          lightstick,
        )}`,
      );
      const result = await res.json();
      if (res.ok && result?.data) {
        const serial = result.data.split("-").pop();
        const nextSerial = (parseInt(serial, 10) + 1)
          .toString()
          .padStart(serial.length, "0");
        setStartSerial(nextSerial);
      } else {
        setStartSerial("0000001");
      }
    } catch (err) {
      console.error("❌ 시리얼 조회 실패:", err);
      alert("시리얼 조회 중 오류 발생");
    }
  };

  const handleFetchCertificationInfo = async () => {
    if (!lightstick) {
      alert("먼저 Lightstick를 입력하세요.");
      return;
    }

    if (!artist) {
      alert("artist를 입력하세요.");
      return;
    }

    setCertificationInfo(certification_info);
    /*
    try {
      const process = "Global";
      const res = await fetch(
        `${SERVER_ADDRESS}/api/config/${process}/${encodeURIComponent(
          lightstick
        )}`
      );
      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.message || "설정 파일을 불러오지 못했습니다.");
      }

      const config = result.data;
      setCertificationInfo(config.CertificationInfo?.CMIIT || "없음");
    } catch (err) {
      console.error("❌ 설정 로딩 오류:", err);
      alert(`❌ 설정 불러오기 실패: ${err.message}`);
    }
*/
  };
  const shuffleInPlace = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const handleGenerate = () => {
    if (
      !artist ||
      !lightstick ||
      !startMac ||
      !endMac ||
      !startSerial ||
      !generatorName
    ) {
      return alert("모든 값을 입력하세요");
    }

    setGeneratedList([]);
    setSelectedMacs([]);
    setRangeStartIndex(null);
    setPage(0);

    const macPrefix = "80:DE:CC";
    const startSuffix = macSuffixToInt(startMac);
    const endSuffix = macSuffixToInt(endMac);

    if (endSuffix < startSuffix) {
      return alert("End MAC은 Start MAC보다 커야 합니다");
    }

    const total = endSuffix - startSuffix + 1;

    // ✅ 1) MAC 풀 생성 (순차)
    const macPool = Array.from({ length: total }, (_, i) =>
      intToMac(macPrefix, startSuffix + i),
    );

    // ✅ 2) MAC 풀 랜덤 셔플
    shuffleInPlace(macPool);

    // ✅ 3) Serial은 순차 유지, MAC만 랜덤 매핑
    const serialStartNum = parseInt(startSerial, 10);
    const serialLen = startSerial.length;

    const chunk = Array.from({ length: total }, (_, i) => ({
      mac: macPool[i],
      serial: `${lightstick}-${(serialStartNum + i)
        .toString()
        .padStart(serialLen, "0")}`,
    }));

    setGeneratedList(chunk);
  };

  const handleMacClick = (index) => {
    if (isSaving) return; // 저장 중일 땐 선택 변경 막기
    const absoluteIndex = page * limit + index;
    if (rangeStartIndex === null) {
      setRangeStartIndex(absoluteIndex);
      setSelectedMacs([generatedList[absoluteIndex]]);
    } else {
      const start = Math.min(rangeStartIndex, absoluteIndex);
      const end = Math.max(rangeStartIndex, absoluteIndex);
      const newSelection = generatedList.slice(start, end + 1);
      setSelectedMacs(newSelection);
      setRangeStartIndex(null);
    }
  };

  const handleSelectAll = () => {
    if (isSaving) return;
    setSelectedMacs(generatedList);
  };

  const handleSave = async () => {
    if (
      !artist ||
      !lightstick ||
      selectedMacs.length === 0 ||
      !startSerial ||
      !generatorName ||
      !fwVersion ||
      !deviceName
    ) {
      return alert("설정값을 모두 입력해야 합니다.");
    }

    const chunkSize = 10000;
    const serialLength = startSerial.length;
    const serialStart = parseInt(startSerial, 10);

    const checkGeneratorName = async () => {
      const res = await fetchWithAuth(
        `${SERVER_ADDRESS}/api/generated/check-generator?generator_name=${encodeURIComponent(
          generatorName,
        )}`,
      );
      if (res.status === 409) {
        const result = await res.json();
        throw new Error(result.message || "중복된 generator_name");
      }
    };

    try {
      // ✅ 저장 시작
      setIsSaving(true);

      // ✅ generator_name 중복 체크 (최초 1회)
      await checkGeneratorName();

      for (let i = 0; i < selectedMacs.length; i += chunkSize) {
        const chunk = selectedMacs.slice(i, i + chunkSize);

        const res = await fetchWithAuth(`${SERVER_ADDRESS}/api/generated`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            artist,
            lightstick,
            macs: chunk.map((item, idx) => ({
              mac: item.mac,
              serial:
                item.serial ||
                `${lightstick}-${(serialStart + i + idx)
                  .toString()
                  .padStart(serialLength, "0")}`,
            })),
            start_serial: startSerial,
            generator_name: generatorName,
            fw_version: fwVersion,
            device_name: deviceName,
            model: model,
            certification_info:
              certification_info === "없음" ? "" : certification_info,
          }),
        });

        const result = await res.json().catch(() => null);

        if (!res.ok || !result?.success) {
          throw new Error(result?.message || "저장 실패");
        }
      }

      alert(`✅ 저장 완료 (${selectedMacs.length}개)`);
    } catch (err) {
      console.error("❌ 저장 오류:", err);
      alert(`❌ 저장 실패: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const Row = ({ index, style }) => {
    const item = pagedList[index];
    const globalIndex = page * limit + index;
    const isSelected = selectedMacs.some((sel) => sel.mac === item.mac);

    return (
      <div
        style={{
          ...style,
          display: "flex",
          backgroundColor: isSelected ? "#d0f0ff" : "white",
          borderBottom: "1px solid #eee",
          fontFamily: "monospace",
          padding: "6px 10px",
          alignItems: "center",
          cursor: isSaving ? "not-allowed" : "pointer",
          opacity: isSaving ? 0.7 : 1,
        }}
        onClick={() => handleMacClick(globalIndex)}
      >
        <div style={{ width: "60px" }}>{globalIndex + 1}</div>
        <div style={{ flex: 1 }}>{item.mac}</div>
        <div style={{ flex: 1 }}>{item.serial}</div>
      </div>
    );
  };

  return (
    <div
      style={{
        height: "110vh",
        overflow: "auto",
        padding: 0,
        fontFamily: "Segoe UI, sans-serif",
        backgroundColor: "#f9fafb",
      }}
    >
      <h2 style={{ marginBottom: "16px", fontSize: "1.8rem", color: "#333" }}>
        생산 관리 등록
      </h2>

      <div style={{ display: "flex", gap: "32px", alignItems: "flex-start" }}>
        {/* 좌측 입력 영역 */}
        <div
          style={{
            flex: 1,
            background: "#fff",
            padding: "10px",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            opacity: isSaving ? 0.8 : 1,
          }}
        >
          <div style={{ marginBottom: "12px" }}>
            <label
              style={{
                fontWeight: "600",
                display: "block",
                marginBottom: "4px",
              }}
            >
              아티스트
            </label>
            <select
              value={artist}
              onChange={(e) => !isSaving && handleArtistChange(e.target.value)}
              disabled={isSaving}
              style={{
                width: "100%",
                padding: "8px",
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
            >
              <option value="">아티스트 선택</option>
              {artists.map((a, idx) => (
                <option key={idx} value={a.artist}>
                  {a.artist}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: "12px" }}>
            <label
              style={{
                fontWeight: "600",
                display: "block",
                marginBottom: "4px",
              }}
            >
              응원봉
            </label>
            <select
              value={lightstick}
              onChange={(e) =>
                !isSaving && handleLightstickChange(e.target.value)
              }
              disabled={isSaving}
              style={{
                width: "100%",
                padding: "8px",
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
            >
              <option value="">응원봉 선택</option>
              {lightsticks.map((a, idx) => (
                <option key={idx} value={a.lightstick}>
                  {a.lightstick}
                </option>
              ))}
            </select>
          </div>

          {[
            [
              "생산 관리명",
              generatorName,
              setGeneratorName,
              "예: FN_OFFICLAL_0120IP_20K_MAC_RANGE",
            ],
            ["시작 MAC 주소", startMac, setStartMac, "예: 80:DE:CC:00:00:00"],
            ["마지막 MAC 주소", endMac, setEndMac, "예: 80:DE:CC:00:00:00"],
          ].map(([label, value, setter, placeholder], idx) => (
            <div key={idx} style={{ marginBottom: "12px" }}>
              <label
                style={{
                  fontWeight: "600",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                {label}
              </label>
              <input
                value={value}
                onChange={(e) => {
                  if (isSaving) return;
                  let newValue = e.target.value;

                  const isReadOnlyField =
                    label === "FW 버전" ||
                    label === "MATERIAL(디바이스명)" ||
                    label === "MATERIAL CODE(모델 정보)";

                  if (isReadOnlyField) return;

                  setter(newValue);
                }}
                readOnly={isSaving}
                placeholder={placeholder}
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: "4px",
                  border: "1px solid " + (isSaving ? "#ddd" : "#ccc"),
                  boxSizing: "border-box",
                  background: isSaving ? "#f3f4f6" : "white",
                }}
              />
            </div>
          ))}

          <div style={{ marginBottom: "12px" }}>
            <label
              style={{
                fontWeight: "600",
                display: "block",
                marginBottom: "4px",
              }}
            >
              시작 Serial 번호
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                value={startSerial}
                onChange={(e) => !isSaving && setStartSerial(e.target.value)}
                placeholder="예: 0000001"
                readOnly={isSaving}
                style={{
                  flex: 1,
                  padding: "8px",
                  borderRadius: "4px",
                  border: "1px solid " + (isSaving ? "#ddd" : "#ccc"),
                }}
              />
              <button
                onClick={handleFetchLastSerial}
                disabled={isSaving}
                style={{
                  padding: "8px 12px",
                  cursor: isSaving ? "not-allowed" : "pointer",
                  opacity: isSaving ? 0.7 : 1,
                }}
              >
                조회
              </button>
            </div>
          </div>

          {[
            ["FW 버전", fwVersion, setFwVersion, "예:x.x"],
            ["MATERIAL(디바이스명)", deviceName, setDeviceName, "예: AB"],
            [
              "MATERIAL CODE(모델 정보)",
              model,
              setModel,
              "예: SVFA23J0S900NN0",
            ],
          ].map(([label, value, setter, placeholder], idx) => (
            <div key={idx} style={{ marginBottom: "12px" }}>
              <label
                style={{
                  fontWeight: "600",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                {label}
              </label>
              <input
                value={value}
                onChange={(e) => {
                  if (isSaving) return;
                  let newValue = e.target.value;

                  const isReadOnlyField =
                    label === "FW 버전" ||
                    label === "MATERIAL(디바이스명)" ||
                    label === "MATERIAL CODE(모델 정보)";

                  if (isReadOnlyField) return;

                  setter(newValue);
                }}
                readOnly={isSaving}
                placeholder={placeholder}
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: "4px",
                  border: "1px solid " + (isSaving ? "#ddd" : "#ccc"),
                  boxSizing: "border-box",
                  background: isSaving ? "#f3f4f6" : "white",
                }}
              />
            </div>
          ))}

          <div style={{ marginBottom: "12px" }}>
            <label
              style={{
                fontWeight: "600",
                display: "block",
                marginBottom: "4px",
              }}
            >
              라벨 인증 정보
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                value={certification_info}
                readOnly
                onChange={(e) => setCertificationInfo(e.target.value)}
                placeholder="라벨에 표시되어야 할 인증 정보"
                style={{
                  flex: 1,
                  padding: "8px",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                }}
              />
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isSaving}
            style={{
              marginTop: "20px",
              padding: "10px 20px",
              backgroundColor: isSaving ? "#6c757d" : "#007bff",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: isSaving ? "not-allowed" : "pointer",
              opacity: isSaving ? 0.8 : 1,
            }}
          >
            ▶ {isSaving ? "생성 중..." : "생성"}
          </button>
        </div>

        {/* 우측 리스트/저장 영역 */}
        <div style={{ flex: 2 }}>
          <div
            style={{
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
                marginBottom: "8px",
              }}
            >
              <h4 style={{ margin: 0 }}>MAC Address 목록</h4>
              <div
                style={{ display: "flex", alignItems: "center", gap: "12px" }}
              >
                <span style={{ fontSize: "14px", color: "#555" }}>
                  총 {generatedList.length.toLocaleString()}개
                </span>
                <button
                  onClick={handleSelectAll}
                  disabled={isSaving}
                  style={{
                    padding: "6px 12px",
                    cursor: isSaving ? "not-allowed" : "pointer",
                    opacity: isSaving ? 0.7 : 1,
                  }}
                >
                  전체 선택
                </button>
              </div>
            </div>

            <div style={{ height: "400px", overflow: "hidden" }}>
              <div
                style={{
                  display: "flex",
                  backgroundColor: "#f1f1f1",
                  fontWeight: "bold",
                  padding: "8px 10px",
                  borderBottom: "1px solid #ccc",
                  fontFamily: "monospace",
                }}
              >
                <div style={{ width: "60px" }}>No</div>
                <div style={{ flex: 1 }}>MAC</div>
                <div style={{ flex: 1 }}>SN</div>
              </div>
              <VirtualList
                height={360}
                itemCount={pagedList.length}
                itemSize={36}
                width="100%"
              >
                {Row}
              </VirtualList>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "12px",
              }}
            >
              <div>
                페이지: {page + 1} / {Math.ceil(generatedList.length / limit)}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                  disabled={page === 0 || isSaving}
                  style={{
                    padding: "6px 12px",
                    cursor: page === 0 || isSaving ? "not-allowed" : "pointer",
                    opacity: page === 0 || isSaving ? 0.6 : 1,
                  }}
                >
                  ◀ 이전
                </button>
                <button
                  onClick={() =>
                    setPage((prev) =>
                      (prev + 1) * limit < generatedList.length
                        ? prev + 1
                        : prev,
                    )
                  }
                  disabled={
                    (page + 1) * limit >= generatedList.length || isSaving
                  }
                  style={{
                    padding: "6px 12px",
                    cursor:
                      (page + 1) * limit >= generatedList.length || isSaving
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      (page + 1) * limit >= generatedList.length || isSaving
                        ? 0.6
                        : 1,
                  }}
                >
                  다음 ▶
                </button>
              </div>
            </div>

            <div style={{ marginTop: "12px", textAlign: "right" }}>
              <button
                onClick={handleSave}
                disabled={isSaving}
                style={{
                  padding: "10px 20px",
                  backgroundColor: isSaving ? "#6c757d" : "#28a745",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: isSaving ? "not-allowed" : "pointer",
                  opacity: isSaving ? 0.8 : 1,
                }}
              >
                {isSaving ? "저장 중..." : "저장"}
              </button>
            </div>

            {isSaving && (
              <p
                style={{
                  marginTop: "8px",
                  textAlign: "right",
                  fontSize: "13px",
                  color: "#555",
                }}
              >
                ⏳ 저장 중입니다. 잠시만 기다려 주세요...
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductionRegister;
