import { useEffect, useState } from "react";
import SERVER_ADDRESS from "../../config";
import { fetchWithAuth } from "../../utils/fetchWithAuth";

function ArtistManager() {
  const [activeTab, setActiveTab] = useState("register");
  const [artistInput, setArtistInput] = useState("");
  const [artists, setArtists] = useState([]);
  const [message, setMessage] = useState("");
  const [selectedArtist, setSelectedArtist] = useState("");
  const [newArtistName, setNewArtistName] = useState("");

  const tableStyle = {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: 10,
    boxShadow: "0 0 5px rgba(0,0,0,0.1)",
  };

  const thTdStyle = {
    border: "1px solid #ddd",
    padding: "10px",
    textAlign: "center",
  };

  const fetchArtists = async () => {
    try {
      const res = await fetchWithAuth(`${SERVER_ADDRESS}/api/artists`, {
        credentials: "include",
      });
      const result = await res.json();
      if (result.success) setArtists(result.data);
      else {
        setArtists([]);
        setMessage(`❌ 조회 실패: ${result.message}`);
      }
    } catch (err) {
      console.error(err);
      setArtists([]);
      setMessage("❌ 서버 예외 발생");
    }
  };

  useEffect(() => {
    fetchArtists();
    setMessage("");
  }, [activeTab]);

  const handleRegister = async () => {
    if (!artistInput.trim()) {
      alert("아티스트 이름을 입력하세요.");
      return;
    }

    try {
      const res = await fetchWithAuth(`${SERVER_ADDRESS}/api/artists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ artist: artistInput.trim() }),
      });

      const result = await res.json();
      setMessage(result.message);
      setArtistInput("");
      fetchArtists();
    } catch (err) {
      console.error(err);
      setMessage("❌ 등록 실패");
    }
  };

  const handleDelete = async (artist) => {
    if (!window.confirm(`'${artist}'을 삭제할까요?`)) return;

    try {
      const res = await fetchWithAuth(`${SERVER_ADDRESS}/api/artists`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ artist }),
      });

      const result = await res.json();
      setMessage(result.message);
      fetchArtists();
    } catch (err) {
      console.error(err);
      setMessage("❌ 삭제 실패");
    }
  };

  const handleUpdate = async () => {
    if (!selectedArtist || !newArtistName.trim()) {
      alert("기존 아티스트와 새 이름을 모두 입력하세요.");
      return;
    }

    try {
      const res = await fetchWithAuth(`${SERVER_ADDRESS}/api/artists/update`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          old_artist: selectedArtist,
          new_artist: newArtistName.trim(),
        }),
      });

      const result = await res.json();
      setMessage(result.message);
      setSelectedArtist("");
      setNewArtistName("");
      fetchArtists();
    } catch (err) {
      console.error(err);
      setMessage("❌ 수정 실패");
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "register":
        return (
          <div style={{ padding: "0 12px" }}>
            <h3 style={{ marginBottom: 20, fontSize: "18px" }}>
              아티스트 등록
            </h3>

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontWeight: "bold",
                  marginBottom: 6,
                  display: "block",
                }}
              >
                아티스트 이름
              </label>
              <input
                placeholder="예: AB"
                value={artistInput}
                onChange={(e) => setArtistInput(e.target.value)}
                style={{
                  padding: "10px",
                  width: "100%",
                  border: "1px solid #ccc",
                  borderRadius: 6,
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
              <p style={{ marginTop: 12, color: "#007bff" }}>{message}</p>
            )}
          </div>
        );
      case "view":
        return (
          <div>
            <h3 style={{ marginBottom: 16 }}>아티스트 목록</h3>
            <table style={tableStyle}>
              <thead style={{ backgroundColor: "#f8f9fa" }}>
                <tr>
                  <th style={thTdStyle}>Artist</th>
                  <th style={thTdStyle}>등록일</th>
                  <th style={thTdStyle}>수정일</th>
                </tr>
              </thead>
              <tbody>
                {artists.map((a, i) => (
                  <tr
                    key={i}
                    style={{
                      backgroundColor: i % 2 === 0 ? "#fff" : "#f2f2f2",
                    }}
                  >
                    <td style={thTdStyle}>{a.artist}</td>
                    <td style={thTdStyle}>
                      {new Date(a.created_at).toLocaleString()}
                    </td>
                    <td style={thTdStyle}>
                      {new Date(a.updated_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case "delete":
        return (
          <div>
            <h3 style={{ marginBottom: 16 }}>아티스트 삭제</h3>
            <table style={tableStyle}>
              <thead style={{ backgroundColor: "#f8f9fa" }}>
                <tr>
                  <th style={thTdStyle}>Artist</th>
                  <th style={thTdStyle}>삭제</th>
                </tr>
              </thead>
              <tbody>
                {artists.map((a, i) => (
                  <tr
                    key={i}
                    style={{
                      backgroundColor: i % 2 === 0 ? "#fff" : "#f2f2f2",
                    }}
                  >
                    <td style={thTdStyle}>{a.artist}</td>
                    <td style={thTdStyle}>
                      <button
                        onClick={() => handleDelete(a.artist)}
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
            {message && (
              <p style={{ marginTop: 10, color: "#dc3545" }}>{message}</p>
            )}
          </div>
        );
      case "update":
        return (
          <div style={{ padding: "0 12px" }}>
            <h3 style={{ marginBottom: 20, fontSize: "18px" }}>
              ✏️ 아티스트 수정
            </h3>

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontWeight: "bold",
                  marginBottom: 6,
                  display: "block",
                }}
              >
                기존 아티스트 선택
              </label>
              <select
                value={selectedArtist}
                onChange={(e) => setSelectedArtist(e.target.value)}
                style={{
                  padding: "10px",
                  borderRadius: 6,
                  width: "100%",
                  border: "1px solid #ccc",
                }}
              >
                <option value="">-- 기존 아티스트 선택 --</option>
                {artists.map((a, i) => (
                  <option key={i} value={a.artist}>
                    {a.artist}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontWeight: "bold",
                  marginBottom: 6,
                  display: "block",
                }}
              >
                새 아티스트 이름
              </label>
              <input
                placeholder="예: AB"
                value={newArtistName}
                onChange={(e) => setNewArtistName(e.target.value)}
                style={{
                  padding: "10px",
                  width: "100%",
                  border: "1px solid #ccc",
                  borderRadius: 6,
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
              <p style={{ marginTop: 12, color: "#28a745" }}>{message}</p>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ padding: 20, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 20 }}>아티스트 관리</h2>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        {["register", "view", "delete" /*, 'update'*/].map((tab) => (
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

export default ArtistManager;
