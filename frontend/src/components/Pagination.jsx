// Pagination.jsx
import React from "react";
import { useSearchParams } from "react-router-dom";
import "./Pagination.css";

function Pagination({ currentPage, totalPages }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const goToPage = (page) => {
    if (page < 1 || page > totalPages) return;

    const newParams = new URLSearchParams(searchParams);
    newParams.set("page", page.toString());
    setSearchParams(newParams); // ✅ 핵심: URL에 page 반영
  };

  const getPageNumbers = () => {
    const pages = [];

    if (currentPage > 3) {
      pages.push(1);
      if (currentPage > 4) pages.push("...");
    }

    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (currentPage < totalPages - 2) {
      if (currentPage < totalPages - 3) pages.push("...");
      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div className="pagination">
      <button
        onClick={() => goToPage(currentPage - 1)}
        disabled={currentPage === 1}
      >
        ‹
      </button>

      {getPageNumbers().map((num, index) =>
        num === "..." ? (
          <span key={`ellipsis-${index}`} className="ellipsis">
            ...
          </span>
        ) : (
          <button
            key={num}
            className={num === currentPage ? "active" : ""}
            onClick={() => goToPage(num)}
          >
            {num}
          </button>
        )
      )}

      <button
        onClick={() => goToPage(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        ›
      </button>
    </div>
  );
}

export default Pagination;
