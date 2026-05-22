import { useEffect, useMemo, useState } from "react";
import SERVER_ADDRESS from "../../config";

const ROLE_OPTIONS = [
  { value: "admin", label: "admin" },
  { value: "operator", label: "operator" },
];

function AccountManager() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [users, setUsers] = useState([]);

  // 생성 폼
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("operator");
  const [newId, setNewId] = useState("");
  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      // admin 먼저, 그 다음 operator, 그 다음 이름 정렬
      if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
      return String(a.name).localeCompare(String(b.name));
    });
  }, [users]);

  async function fetchUsers() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${SERVER_ADDRESS}/api/auth/users`, {
        method: "GET",
        credentials: "include",
      });
      const result = await res.json();
      if (!res.ok || !result?.success)
        throw new Error(result?.message || "조회 실패");

      setUsers(result.data || []);
    } catch (e) {
      console.error(e);
      setError(e.message || "조회 중 오류");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  async function createUser() {
    setError("");
    const id = newId.trim();
    const name = newName.trim();
    if (!id) return setError("ID를 입력하세요.");
    if (!name) return setError("이름(name)을 입력하세요.");
    if (!["admin", "operator"].includes(newRole))
      return setError("role 값이 올바르지 않습니다.");

    if (
      !window.confirm(`계정을 생성할까요?\n- name: ${name}\n- role: ${newRole}`)
    )
      return;

    setBusy(true);
    try {
      const res = await fetch(`${SERVER_ADDRESS}/api/auth/users`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name,
          password: newPassword,
          role: newRole,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result?.success)
        throw new Error(result?.message || "생성 실패");

      setNewName("");
      setNewId("");
      setNewPassword("");
      setNewRole("operator");
      await fetchUsers();
      alert("계정이 생성되었습니다.");
    } catch (e) {
      console.error(e);
      setError(e.message || "생성 중 오류");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(userId, nextRole) {
    setError("");
    if (!["admin", "operator"].includes(nextRole)) return;

    if (!window.confirm(`권한을 '${nextRole}'로 변경할까요? (id=${userId})`))
      return;

    setBusy(true);
    try {
      const res = await fetch(
        `${SERVER_ADDRESS}/api/auth/users/${userId}/role`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: nextRole }),
        }
      );
      const result = await res.json();
      if (!res.ok || !result?.success)
        throw new Error(result?.message || "권한 변경 실패");

      // 로컬 즉시 반영 후 재조회(안정)
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: nextRole } : u))
      );
      await fetchUsers();
    } catch (e) {
      console.error(e);
      setError(e.message || "권한 변경 중 오류");
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser(userId, userName) {
    setError("");
    if (
      !window.confirm(
        `계정을 삭제할까요?\n- id: ${userId}\n- name: ${userName}\n삭제 후 복구 불가`
      )
    )
      return;

    setBusy(true);
    try {
      const res = await fetch(`${SERVER_ADDRESS}/api/auth/users/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const result = await res.json();
      if (!res.ok || !result?.success)
        throw new Error(result?.message || "삭제 실패");

      setUsers((prev) => prev.filter((u) => u.id !== userId));
      await fetchUsers();
      alert("삭제되었습니다.");
    } catch (e) {
      console.error(e);
      setError(e.message || "삭제 중 오류");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div>로딩 중...</div>;

  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        paddingBottom: 24,
        boxSizing: "border-box",
      }}
    >
      <h2 style={{ marginTop: 0 }}>계정 관리</h2>

      {error ? (
        <div
          style={{
            padding: 10,
            marginBottom: 12,
            border: "1px solid #ffb3b3",
            background: "#fff0f0",
          }}
        >
          <b style={{ color: "#c00" }}>오류:</b> {error}
        </div>
      ) : null}

      {/* 생성 카드 */}
      <div
        style={{
          border: "1px solid #ccc",
          background: "#fff",
          padding: 12,
          borderRadius: 6,
          marginBottom: 16,
        }}
      >
        <div style={{ fontWeight: "bold", marginBottom: 8 }}>계정 생성</div>

        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, color: "#666" }}>id</label>
            <input
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="로그인 ID (예: operator01)"
              style={{
                padding: "8px 10px",
                border: "1px solid #ccc",
                borderRadius: 4,
                width: 200,
              }}
              disabled={busy}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, color: "#666" }}>name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="예: operator01"
              style={{
                padding: "8px 10px",
                border: "1px solid #ccc",
                borderRadius: 4,
                width: 200,
              }}
              disabled={busy}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, color: "#666" }}>password</label>
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="비밀번호"
              type="password"
              style={{
                padding: "8px 10px",
                border: "1px solid #ccc",
                borderRadius: 4,
                width: 200,
              }}
              disabled={busy}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, color: "#666" }}>role</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              style={{
                padding: "8px 10px",
                border: "1px solid #ccc",
                borderRadius: 4,
                width: 140,
              }}
              disabled={busy}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={createUser}
            disabled={busy}
            style={{
              border: "1px solid #2b78ff",
              background: busy ? "#a9c7ff" : "#2b78ff",
              color: "#fff",
              padding: "9px 14px",
              borderRadius: 4,
              cursor: busy ? "not-allowed" : "pointer",
              marginTop: 18,
            }}
          >
            생성
          </button>

          <button
            onClick={fetchUsers}
            disabled={busy}
            style={{
              border: "1px solid #ccc",
              background: "#f6f6f6",
              padding: "9px 14px",
              borderRadius: 4,
              cursor: busy ? "not-allowed" : "pointer",
              marginTop: 18,
            }}
          >
            새로고침
          </button>
        </div>
      </div>

      {/* 리스트 */}
      <div
        style={{
          border: "1px solid #ccc",
          background: "#fff",
          padding: 12,
          borderRadius: 6,
        }}
      >
        <div style={{ fontWeight: "bold", marginBottom: 10 }}>
          계정 리스트{" "}
          <span style={{ color: "#666", fontWeight: "normal" }}>
            ({sortedUsers.length})
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}
          >
            <thead>
              <tr style={{ background: "#f3f3f3" }}>
                <th style={thStyle}>id</th>
                <th style={thStyle}>name</th>
                <th style={thStyle}>role</th>
                <th style={thStyle}>action</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((u) => (
                <tr key={u.id}>
                  <td style={tdStyle}>{u.id}</td>
                  <td style={tdStyle}>{u.name}</td>
                  <td style={tdStyle}>
                    <select
                      value={u.role}
                      onChange={(e) => changeRole(u.id, e.target.value)}
                      disabled={busy}
                      style={{
                        padding: "6px 8px",
                        border: "1px solid #ccc",
                        borderRadius: 4,
                      }}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => deleteUser(u.id, u.name)}
                      disabled={busy}
                      style={{
                        border: "1px solid #ff6b6b",
                        background: "#fff",
                        color: "#c00",
                        padding: "6px 10px",
                        borderRadius: 4,
                        cursor: busy ? "not-allowed" : "pointer",
                      }}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}

              {sortedUsers.length === 0 ? (
                <tr>
                  <td style={tdStyle} colSpan={4}>
                    계정이 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, color: "#666", fontSize: 12 }}>
          참고: 비밀번호(password)는 보안상 리스트에 표시하지 않습니다.
        </div>
      </div>
    </div>
  );
}

const thStyle = {
  textAlign: "left",
  padding: "10px 8px",
  borderBottom: "1px solid #ddd",
  fontSize: 13,
};

const tdStyle = {
  padding: "10px 8px",
  borderBottom: "1px solid #eee",
  fontSize: 13,
};

export default AccountManager;
