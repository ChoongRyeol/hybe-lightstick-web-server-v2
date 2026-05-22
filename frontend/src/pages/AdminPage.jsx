import AppLayout from "../components/AppLayout";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import ProductionRegister from "./admin/ProductionRegister";
import MacAddressDeleter from "./admin/MacAddressDeleter";
import ProductionHistory from "./admin/ProductionHistory";
import SERVER_ADDRESS from "../config";
import ArtistManager from "./admin/ArtistManager";
import LightStickManager from "./admin/LightStickManager";
import ProductionManager from "./admin/ProductionManager";
import SettingsManager from "./admin/SettingsManager";
import AccountManager from "./admin/AccountManager";
import ProgramVersionManager from "./admin/ProgramVersionManager";
import ProductionHistoryBackup from "./admin/ProductionHistoryBackup.jsx";

function AdminPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [selectedMenu, setSelectedMenu] = useState("mac");
  const [authChecked, setAuthChecked] = useState(false);
  const redirectRef = useRef(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch(`${SERVER_ADDRESS}/api/auth/check-session`, {
          method: "GET",
          credentials: "include",
        });
        const result = await res.json();

        if (!result.loggedIn && !redirectRef.current) {
          redirectRef.current = true;
          alert("관리자 로그인이 필요합니다.");
          navigate("/login");
        } else if (result.user.role !== "admin" && !redirectRef.current) {
          redirectRef.current = true;
          alert("관리자만 접근할 수 있습니다.");
          navigate("/admin");
        } else {
          setLoading(false);
          setAuthChecked(true);
        }
      } catch (err) {
        console.error("세션 확인 실패:", err);
        if (!redirectRef.current) {
          redirectRef.current = true;
          alert("세션 확인 중 오류 발생");
          navigate("/login");
        }
      }
    };

    checkAuth();
  }, [navigate]);

  if (loading || !authChecked) return <div>로딩 중...</div>;

  return (
    <AppLayout>
      <div style={{ display: "flex", height: "100vh" }}>
        {/* 왼쪽 메뉴 */}
        <div
          style={{
            width: 200,
            backgroundColor: "#f0f0f0",
            padding: 20,
            flexShrink: 0,
          }}
        >
          <h3>관리자 메뉴</h3>
          <ul style={{ listStyle: "none", paddingLeft: 0 }}>
            <li style={{ marginBottom: 10 }}>
              <button
                onClick={() => setSelectedMenu("production")}
                style={{
                  fontWeight: selectedMenu === "production" ? "bold" : "normal",
                  backgroundColor:
                    selectedMenu === "production" ? "#d0e6ff" : "#fff",
                  border: "1px solid #ccc",
                  padding: "8px 12px",
                  width: "100%",
                  cursor: "pointer",
                  borderRadius: 4,
                }}
              >
                생산 관리
              </button>
            </li>
            <li style={{ marginBottom: 10 }}>
              <button
                onClick={() => setSelectedMenu("artists")}
                style={{
                  fontWeight: selectedMenu === "artists" ? "bold" : "normal",
                  backgroundColor:
                    selectedMenu === "artists" ? "#d0e6ff" : "#fff",
                  border: "1px solid #ccc",
                  padding: "8px 12px",
                  width: "100%",
                  cursor: "pointer",
                  borderRadius: 4,
                }}
              >
                아티스트 관리
              </button>
            </li>
            <li style={{ marginBottom: 10 }}>
              <button
                onClick={() => setSelectedMenu("lightsticks")}
                style={{
                  fontWeight:
                    selectedMenu === "lightsticks" ? "bold" : "normal",
                  backgroundColor:
                    selectedMenu === "lightsticks" ? "#d0e6ff" : "#fff",
                  border: "1px solid #ccc",
                  padding: "8px 12px",
                  width: "100%",
                  cursor: "pointer",
                  borderRadius: 4,
                }}
              >
                응원봉 관리
              </button>
            </li>
            <li style={{ marginBottom: 10 }}>
              <button
                onClick={() => setSelectedMenu("settings")}
                style={{
                  fontWeight: selectedMenu === "settings" ? "bold" : "normal",
                  backgroundColor:
                    selectedMenu === "settings" ? "#d0e6ff" : "#fff",
                  border: "1px solid #ccc",
                  padding: "8px 12px",
                  width: "100%",
                  cursor: "pointer",
                  borderRadius: 4,
                }}
              >
                설정
              </button>
            </li>

            <li style={{ marginBottom: 10 }}>
              <button
                onClick={() => setSelectedMenu("accounts")}
                style={{
                  fontWeight: selectedMenu === "accounts" ? "bold" : "normal",
                  backgroundColor:
                    selectedMenu === "accounts" ? "#d0e6ff" : "#fff",
                  border: "1px solid #ccc",
                  padding: "8px 12px",
                  width: "100%",
                  cursor: "pointer",
                  borderRadius: 4,
                }}
              >
                계정 관리
              </button>
            </li>

            <li style={{ marginBottom: 10 }}>
              <button
                onClick={() => setSelectedMenu("programversion")}
                style={{
                  fontWeight:
                    selectedMenu === "programversion" ? "bold" : "normal",
                  backgroundColor:
                    selectedMenu === "programversion" ? "#d0e6ff" : "#fff",
                  border: "1px solid #ccc",
                  padding: "8px 12px",
                  width: "100%",
                  cursor: "pointer",
                  borderRadius: 4,
                }}
              >
                공정 프로그램 버전 관리
              </button>
            </li>
            <li style={{ marginBottom: 10 }}>
              <button
                onClick={() => setSelectedMenu("backup")}
                style={{
                  fontWeight: selectedMenu === "backup" ? "bold" : "normal",
                  backgroundColor:
                    selectedMenu === "backup" ? "#d0e6ff" : "#fff",
                  border: "1px solid #ccc",
                  padding: "8px 12px",
                  width: "100%",
                  cursor: "pointer",
                  borderRadius: 4,
                }}
              >
                백업 관리
              </button>
            </li>
          </ul>
        </div>

        {/* 오른쪽 내용 */}
        <div
          style={{
            flex: 1,
            padding: "10px 20px 20px 20px",
            overflow: "auto",
            maxWidth: "100%",
            boxSizing: "border-box",
          }}
        >
          {selectedMenu === "production" && <ProductionManager />}
          {selectedMenu === "artists" && <ArtistManager />}
          {selectedMenu === "lightsticks" && <LightStickManager />}
          {selectedMenu === "settings" && <SettingsManager />}
          {selectedMenu === "accounts" && <AccountManager />}
          {selectedMenu === "programversion" && <ProgramVersionManager />}
          {selectedMenu === "backup" && <ProductionHistoryBackup />}
        </div>
      </div>
    </AppLayout>
  );
}

export default AdminPage;
