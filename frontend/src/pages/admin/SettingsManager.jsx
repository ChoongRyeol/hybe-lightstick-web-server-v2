import { useEffect, useState } from "react";
import SERVER_ADDRESS from "../../config";
import { fetchWithAuth } from "../../utils/fetchWithAuth";

function SettingsManager() {
  const [loading, setLoading] = useState(false);
  const [savingBle, setSavingBle] = useState(false);
  const [savingCurrent, setSavingCurrent] = useState(false);

  const [rssiMin, setRssiMin] = useState(-85);
  const [bleUpdatedAt, setBleUpdatedAt] = useState(null);

  const [lowCurrentMin, setLowCurrentMin] = useState(10);
  const [lowCurrentMax, setLowCurrentMax] = useState(30);

  const [highCurrentMin, setHighCurrentMin] = useState(80);
  const [highCurrentMax, setHighCurrentMax] = useState(200);
  const [currentUpdatedAt, setCurrentUpdatedAt] = useState(null);

  const loadBleConfig = async () => {
    const res = await fetchWithAuth(`${SERVER_ADDRESS}/api/settings/ble`, {
      method: "GET",
    });

    const result = await res.json();

    if (result.success && result.data) {
      const c = result.data;
      setRssiMin(c.rssi_min ?? -85);
      setBleUpdatedAt(c.updated_at ?? c.created_at ?? null);
    } else {
      throw new Error(result.message || "BLE 설정 정보를 불러오지 못했습니다.");
    }
  };

  const loadCurrentConfig = async () => {
    const res = await fetchWithAuth(`${SERVER_ADDRESS}/api/settings/current`, {
      method: "GET",
    });

    const result = await res.json();

    if (result.success && result.data) {
      const c = result.data;
      setLowCurrentMin(c.low_current_min ?? 10);
      setLowCurrentMax(c.low_current_max ?? 30);

      setHighCurrentMin(c.high_current_min ?? 80);
      setHighCurrentMax(c.high_current_max ?? 200);
      setCurrentUpdatedAt(c.updated_at ?? c.created_at ?? null);
    } else {
      throw new Error(
        result.message || "소모전류 설정 정보를 불러오지 못했습니다.",
      );
    }
  };

  const loadConfig = async () => {
    setLoading(true);

    try {
      await Promise.all([loadBleConfig(), loadCurrentConfig()]);
    } catch (err) {
      console.error("설정 조회 오류:", err);
      alert(err.message || "설정 조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBle = async () => {
    const value = Number(rssiMin);

    if (!Number.isFinite(value)) {
      alert("RSSI 최소값이 유효하지 않습니다.");
      return;
    }

    setSavingBle(true);

    try {
      const res = await fetchWithAuth(`${SERVER_ADDRESS}/api/settings/ble`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rssi_min: value,
        }),
      });

      const result = await res.json();

      if (result.success) {
        alert("RSSI 설정이 저장되었습니다.");
        await loadBleConfig();
      } else {
        alert(result.message || "RSSI 설정 저장에 실패했습니다.");
      }
    } catch (err) {
      console.error("BLE 설정 저장 오류:", err);
      alert("RSSI 설정 저장 중 오류가 발생했습니다.");
    } finally {
      setSavingBle(false);
    }
  };

  const handleSaveCurrent = async () => {
    const lowMin = Number(lowCurrentMin);
    const lowMax = Number(lowCurrentMax);

    const highMin = Number(highCurrentMin);
    const highMax = Number(highCurrentMax);
    if (!Number.isFinite(lowMin)) {
      alert("저휘도 최소값이 유효하지 않습니다.");
      return;
    }

    if (!Number.isFinite(lowMax)) {
      alert("저휘도 최대값이 유효하지 않습니다.");
      return;
    }

    if (!Number.isFinite(highMin)) {
      alert("고휘도 최소값이 유효하지 않습니다.");
      return;
    }

    if (!Number.isFinite(highMax)) {
      alert("고휘도 최대값이 유효하지 않습니다.");
      return;
    }

    if (lowMin > lowMax) {
      alert("저휘도 최소값은 최대값보다 클 수 없습니다.");
      return;
    }

    if (highMin > highMax) {
      alert("고휘도 최소값은 최대값보다 클 수 없습니다.");
      return;
    }

    setSavingCurrent(true);

    try {
      const res = await fetchWithAuth(
        `${SERVER_ADDRESS}/api/settings/current`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            low_current_min: lowMin,
            low_current_max: lowMax,

            high_current_min: highMin,
            high_current_max: highMax,
          }),
        },
      );

      const result = await res.json();

      if (result.success) {
        alert("소모전류 설정이 저장되었습니다.");
        await loadCurrentConfig();
      } else {
        alert(result.message || "소모전류 설정 저장에 실패했습니다.");
      }
    } catch (err) {
      console.error("소모전류 설정 저장 오류:", err);
      alert("소모전류 설정 저장 중 오류가 발생했습니다.");
    } finally {
      setSavingCurrent(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={{ marginBottom: 8 }}>설정</h2>

      {loading ? (
        <div>설정 불러오는 중...</div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: 20,
              backgroundColor: "#fafafa",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>BLE / RSSI 설정</h3>

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "block",
                  fontWeight: "bold",
                  marginBottom: 4,
                }}
              >
                RSSI 최소값 (dBm)
              </label>

              <input
                type="number"
                value={rssiMin}
                onChange={(e) => setRssiMin(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  boxSizing: "border-box",
                }}
                placeholder="-85"
              />

              <small style={{ color: "#777" }}>
                Mac Write 공정 프로그램에 적용 됩니다.
              </small>
            </div>

            {bleUpdatedAt && (
              <div
                style={{
                  marginTop: 8,
                  marginBottom: 16,
                  fontSize: 12,
                  color: "#888",
                }}
              >
                마지막 업데이트: {bleUpdatedAt}
              </div>
            )}

            <div style={{ textAlign: "right", marginTop: 10 }}>
              <button
                onClick={handleSaveBle}
                disabled={savingBle}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#1677ff",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  cursor: savingBle ? "not-allowed" : "pointer",
                  fontWeight: "bold",
                }}
              >
                {savingBle ? "저장 중..." : "RSSI 저장"}
              </button>
            </div>
          </div>

          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: 20,
              backgroundColor: "#fafafa",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>소모전류 설정</h3>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  border: "1px solid #e5e5e5",
                  borderRadius: 8,
                  padding: 16,
                  backgroundColor: "#fff",
                }}
              >
                <h4 style={{ marginTop: 0, marginBottom: 12 }}>저휘도 전류</h4>

                <div style={{ marginBottom: 12 }}>
                  <label
                    style={{
                      display: "block",
                      fontWeight: "bold",
                      marginBottom: 4,
                    }}
                  >
                    최소값 (mA)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={lowCurrentMin}
                    onChange={(e) => setLowCurrentMin(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      boxSizing: "border-box",
                    }}
                    placeholder="10"
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontWeight: "bold",
                      marginBottom: 4,
                    }}
                  >
                    최대값 (mA)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={lowCurrentMax}
                    onChange={(e) => setLowCurrentMax(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      boxSizing: "border-box",
                    }}
                    placeholder="30"
                  />
                </div>
              </div>

              <div
                style={{
                  border: "1px solid #e5e5e5",
                  borderRadius: 8,
                  padding: 16,
                  backgroundColor: "#fff",
                }}
              >
                <h4 style={{ marginTop: 0, marginBottom: 12 }}>고휘도 전류</h4>

                <div style={{ marginBottom: 12 }}>
                  <label
                    style={{
                      display: "block",
                      fontWeight: "bold",
                      marginBottom: 4,
                    }}
                  >
                    최소값 (mA)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={highCurrentMin}
                    onChange={(e) => setHighCurrentMin(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      boxSizing: "border-box",
                    }}
                    placeholder="80"
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontWeight: "bold",
                      marginBottom: 4,
                    }}
                  >
                    최대값 (mA)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={highCurrentMax}
                    onChange={(e) => setHighCurrentMax(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      boxSizing: "border-box",
                    }}
                    placeholder="200"
                  />
                </div>
              </div>
            </div>

            <small style={{ color: "#777" }}>
              Mac Write 공정 프로그램에 적용 됩니다.
            </small>

            {currentUpdatedAt && (
              <div
                style={{
                  marginTop: 8,
                  marginBottom: 16,
                  fontSize: 12,
                  color: "#888",
                }}
              >
                마지막 업데이트: {currentUpdatedAt}
              </div>
            )}

            <div style={{ textAlign: "right", marginTop: 10 }}>
              <button
                onClick={handleSaveCurrent}
                disabled={savingCurrent}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#1677ff",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  cursor: savingCurrent ? "not-allowed" : "pointer",
                  fontWeight: "bold",
                }}
              >
                {savingCurrent ? "저장 중..." : "소모전류 저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsManager;
