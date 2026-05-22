import { useSearchParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import AppLayout from "../components/AppLayout";
import SERVER_ADDRESS from "../config";

function LoginPage() {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectPath = searchParams.get("redirect") || "/admin"; // ✅ 기본값은 dashboard

  const handleLogin = async () => {
    const res = await fetch(`${SERVER_ADDRESS}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id, password }),
    });

    const result = await res.json();

    if (result.success) {
      navigate(redirectPath); // ✅ 로그인 성공 시 원래 위치로 이동
    } else {
      alert("로그인 실패: " + result.message);
    }
  };

  return (
    <AppLayout>
      <div
        style={{
          padding: 40,
          maxWidth: 360,
          margin: "80px auto",
          backgroundColor: "#f9f9f9",
          borderRadius: 12,
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        }}
      >
        <h2 style={{ textAlign: "center", marginBottom: 24 }}>🔐 로그인</h2>

        <div style={{ marginBottom: 16 }}>
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="아이디"
            style={{
              width: "100%",
              padding: "12px 16px",
              fontSize: 16,
              borderRadius: 6,
              border: "1px solid #ccc",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            style={{
              width: "100%",
              padding: "12px 16px",
              fontSize: 16,
              borderRadius: 6,
              border: "1px solid #ccc",
              boxSizing: "border-box",
            }}
          />
        </div>

        <button
          onClick={handleLogin}
          style={{
            width: "100%",
            padding: "12px 0",
            backgroundColor: "#007bff",
            color: "white",
            fontSize: 16,
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            transition: "background-color 0.3s",
          }}
          onMouseOver={(e) => (e.target.style.backgroundColor = "#0056b3")}
          onMouseOut={(e) => (e.target.style.backgroundColor = "#007bff")}
        >
          로그인
        </button>
      </div>
    </AppLayout>
  );
}

export default LoginPage;
