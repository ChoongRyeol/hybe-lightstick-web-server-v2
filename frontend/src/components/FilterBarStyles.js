// src/components/FilterBarStyles.js

export const FILTER = {
  wrap: {
    display: "flex",
    gap: 10,
    alignItems: "center",
  },

  group: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },

  label: {
    color: "#ffca28",
    fontSize: 13,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },

  control: {
    height: 34,
    backgroundColor: "#1e1e2f",
    color: "#fff",
    border: "1px solid #555",
    padding: "6px 10px",
    borderRadius: 6,
    outline: "none",
  },
  controlNumber: {
    height: 34,
    backgroundColor: "#1e1e2f",
    color: "#fff",
    border: "1px solid #555",
    borderRadius: 6,
    outline: "none",
    boxSizing: "border-box",

    // 핵심: input은 padding/lineHeight로 시각 높이가 달라짐
    padding: "0 10px",
    lineHeight: "34px",
    fontSize: 13,

    // number input 기본 스타일 영향 최소화
    appearance: "textfield",
  },
  button: {
    height: 34,
    padding: "6px 12px",
    fontSize: 13,
    backgroundColor: "#2b2b40",
    color: "#fff",
    border: "1px solid #555",
    borderRadius: 6,
    cursor: "pointer",
  },

  buttonPrimary: {
    height: 34,
    padding: "6px 12px",
    fontSize: 13,
    backgroundColor: "#4fc3f7",
    color: "#000",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 700,
  },

  // disabled 표현(선택)
  disabled: {
    opacity: 0.45,
    pointerEvents: "none",
  },
};

export function mergeStyle(...styles) {
  return Object.assign({}, ...styles.filter(Boolean));
}
