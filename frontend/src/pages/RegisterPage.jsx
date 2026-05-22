import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import SERVER_ADDRESS from "../config";
import { fetchWithAuth } from "../utils/fetchWithAuth";
import AppLayout from "../components/AppLayout";

function RegisterPage() {
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("operator");
  const navigate = useNavigate();
  const redirectRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

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
          alert("로그인이 필요합니다.");
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

  const handleRegister = async () => {
    const res = await fetchWithAuth(`${SERVER_ADDRESS}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, id, password, role }),
    });

    const result = await res.json();
    if (result.success) {
      alert("등록 완료. 로그인 페이지로 이동합니다.");
      navigate("/login"); // ✅ 로그인 페이지로 이동
    } else {
      alert(result.message || "등록 실패");
    }
  };

  return (
    <AppLayout>
      <div
        style={{
          padding: 40,
          maxWidth: 400,
          margin: "80px auto",
          backgroundColor: "#f9f9f9",
          borderRadius: 12,
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        }}
      >
        <h2 style={{ textAlign: "center", marginBottom: 24 }}>👷 등록</h2>

        <div style={{ marginBottom: 16 }}>
          <input
            placeholder="이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
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

        <div style={{ marginBottom: 16 }}>
          <input
            placeholder="ID"
            value={id}
            onChange={(e) => setId(e.target.value)}
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

        <div style={{ marginBottom: 16 }}>
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 16px",
              fontSize: 16,
              borderRadius: 6,
              border: "1px solid #ccc",
              boxSizing: "border-box",
              backgroundColor: "#fff",
            }}
          >
            <option value="operator">작업자</option>
            <option value="admin">관리자</option>
          </select>
        </div>

        <button
          onClick={handleRegister}
          style={{
            width: "100%",
            padding: "12px 0",
            backgroundColor: "#28a745",
            color: "#fff",
            fontSize: 16,
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            transition: "background-color 0.3s",
          }}
          onMouseOver={(e) => (e.target.style.backgroundColor = "#218838")}
          onMouseOut={(e) => (e.target.style.backgroundColor = "#28a745")}
        >
          등록
        </button>
      </div>
    </AppLayout>
  );
}

export default RegisterPage;
