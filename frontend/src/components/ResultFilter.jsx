// src/components/ResultFilter.jsx
import React from "react";
import { FILTER, mergeStyle } from "./FilterBarStyles";

export default function ResultFilter({
  enabled = true,
  value = "",
  onChange,
  label = "결과",
}) {
  const v = String(value || "").toUpperCase();

  return (
    <div style={mergeStyle(FILTER.wrap, !enabled && FILTER.disabled)}>
      <div style={FILTER.group}>
        <span style={FILTER.label}>{label}</span>
        <select
          value={v}
          onChange={(e) => onChange?.(e.target.value)}
          style={mergeStyle(FILTER.control, { width: 120 })}
        >
          <option value="">ALL</option>
          <option value="PASS">PASS</option>
          <option value="FAIL">FAIL</option>
          <option value="OTHER">OTHER</option>
        </select>
      </div>
    </div>
  );
}
