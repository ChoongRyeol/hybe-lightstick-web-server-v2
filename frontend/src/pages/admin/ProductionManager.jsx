// src/pages/admin/ProductionManager.jsx
import { useState } from "react";
import ProductionRegister from "./ProductionRegister";
import MacAddressDeleter from "./MacAddressDeleter";
import ProductionHistory from "./ProductionHistory";
import ProductionEditor from "./ProductionEditor";

function ProductionManager() {
  const [activeTab, setActiveTab] = useState("generator");

  const renderTabContent = () => {
    switch (activeTab) {
      case "generator":
        return <ProductionRegister />;
      case "deleter":
        return <MacAddressDeleter />;
      case "editor":
        return <ProductionEditor />;
      case "history":
        return <ProductionHistory />;
      default:
        return null;
    }
  };

  const tabStyle = (tab) => ({
    flex: 1,
    padding: "10px",
    borderRadius: "6px",
    border: activeTab === tab ? "2px solid #007bff" : "1px solid #ccc",
    backgroundColor: activeTab === tab ? "#eaf1ff" : "#fff",
    fontWeight: activeTab === tab ? "bold" : "normal",
    cursor: "pointer",
  });

  return (
    <div style={{ padding: 0 }}>
      <h2>생산 관리</h2>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <button
          style={tabStyle("generator")}
          onClick={() => setActiveTab("generator")}
        >
          생산 관리 등록
        </button>
        <button
          style={tabStyle("history")}
          onClick={() => setActiveTab("history")}
        >
          생산 관리 조회
        </button>
        <button
          style={tabStyle("editor")} // ✅ 수정 탭 버튼
          onClick={() => setActiveTab("editor")}
        >
          생산 관리 수정
        </button>
        {/* <button
          style={tabStyle("deleter")}
          onClick={() => setActiveTab("deleter")}
        >
          MAC 삭제
        </button> */}
      </div>
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 6,
          padding: 16,
          overflowX: "auto", // ✅ 핵심
          maxWidth: "100%", // ✅ 부모 이상 안 커짐
          boxSizing: "border-box",
        }}
      >
        <div style={{ minWidth: "1000px" }}>{renderTabContent()}</div>
      </div>
    </div>
  );
}

export default ProductionManager;
