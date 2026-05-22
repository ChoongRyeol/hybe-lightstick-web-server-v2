import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import SERVER_ADDRESS from "../config";

function DashboardPage() {
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // 세션 확인
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch(`${SERVER_ADDRESS}/api/auth/check-session`, {
          credentials: "include",
        });
        const result = await res.json();

        if (result.loggedIn) {
          setUserInfo({
            id: result.user.id,
            name: result.user.name,
            role: result.user.role,
          });
        }
      } catch (err) {
        console.error("세션 확인 실패:", err);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();
  }, []);

  const handleLogout = async () => {
    try {
      const res = await fetch(`${SERVER_ADDRESS}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      const result = await res.json();

      if (result.success) {
        alert("로그아웃 되었습니다.");
        setUserInfo(null);
      } else {
        alert("로그아웃 실패");
      }
    } catch (err) {
      console.error("로그아웃 오류:", err);
    }
  };

  if (isLoading) return <div>로딩 중...</div>;

  const buttonStyle = {
    padding: "10px 20px",
    backgroundColor: "#007bff",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 16,
    cursor: "pointer",
    transition: "background-color 0.3s",
  };

  return (
    <div
      style={{
        padding: 40,
        maxWidth: 600,
        margin: "60px auto",
        backgroundColor: "#f5f5f5",
        borderRadius: 12,
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
      }}
    >
      <h2 style={{ textAlign: "left", marginBottom: 8 }}>
        📊 LightStick 공정 관리자 대시보드
      </h2>
      <p style={{ textAlign: "left", marginBottom: 24, color: "#666" }}>
        ※ LightStick Web System V2 v1.0.0
      </p>

      {userInfo && (
        <div
          style={{
            marginBottom: 24,
            backgroundColor: "#e9f5ff",
            padding: "12px 16px",
            borderRadius: 8,
            fontSize: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          👤{" "}
          <strong>
            {userInfo.name} ({userInfo.id})
          </strong>{" "}
          님 접속 중
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {!userInfo && (
          <button onClick={() => navigate("/login")} style={buttonStyle}>
            로그인
          </button>
        )}
        {userInfo && (
          <button
            onClick={handleLogout}
            style={{ ...buttonStyle, backgroundColor: "#dc3545" }}
            onMouseOver={(e) => (e.target.style.backgroundColor = "#c82333")}
            onMouseOut={(e) => (e.target.style.backgroundColor = "#dc3545")}
          >
            로그아웃
          </button>
        )}
        <button onClick={() => navigate("/register")} style={buttonStyle}>
          등록
        </button>
        <button onClick={() => navigate("/admin/menu")} style={buttonStyle}>
          관리자 설정
        </button>
      </div>
    </div>
  );
}

export default DashboardPage;
