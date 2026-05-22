// src/components/AppLayout.jsx
import { useNavigate } from "react-router-dom";

function AppLayout({ children }) {
  const navigate = useNavigate();

  return (
    <div>
      {/* 상단 네비게이션 바 */}
      <div
        style={{
          height: 50,
          backgroundColor: "#f5f5f5",
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          borderBottom: "1px solid #ccc",
          position: "sticky",
          top: 0,
          zIndex: 1000,
        }}
      >
        <button
          onClick={() => navigate("/admin")}
          style={{
            fontSize: "16px",
            fontWeight: "bold",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#333",
          }}
        >
          🏠 대시보드로 이동
        </button>
      </div>

      {/* ✅ 우측 컨텐츠 */}
      <div
        style={{
          flex: 1,
          overflowX: "hidden", // ❗ 이게 핵심
          overflowY: "auto",
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default AppLayout;
