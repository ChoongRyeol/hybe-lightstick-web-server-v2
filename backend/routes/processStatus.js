const express = require("express");
const router = express.Router();
const { catalogPool, dataPool, authPool } = require("../db");

// 전체 공정 완료 여부 확인
router.get("/full-process/check", async (req, res) => {
  const { generator_name, mac_address } = req.query;

  if (!generator_name || !mac_address) {
    return res.status(400).json({
      success: false,
      message: "generator_name과 mac_address는 필수입니다.",
    });
  }

  try {
    // 1️⃣ 각 테이블 존재 여부 조회 (병렬 처리)
    const queries = [
      dataPool.query(
        `SELECT 1 FROM process_device_test WHERE generator_name = ? AND mac_address = ? LIMIT 1`,
        [generator_name, mac_address],
      ),
      dataPool.query(
        `SELECT 1 FROM process_compare WHERE generator_name = ? AND mac_address = ? LIMIT 1`,
        [generator_name, mac_address],
      ),
      dataPool.query(
        `SELECT 1 FROM giftbox_label_print_logs WHERE generator_name = ? AND mac_address = ? LIMIT 1`,
        [generator_name, mac_address],
      ),
    ];

    const [macWriteResult, compareResult, labelResult] =
      await Promise.all(queries);

    // 2️⃣ 존재 여부 판별
    const result = {
      mac_write: macWriteResult[0].length > 0,
      compare: compareResult[0].length > 0,
      giftbox: labelResult[0].length > 0,
    };

    // 3️⃣ 전체 완료 여부
    const allCompleted = Object.values(result).every((v) => v === true);

    res.json({
      success: true,
      allCompleted,
      details: result,
    });
  } catch (err) {
    console.error("전체 공정 체크 오류:", err);
    res.status(500).json({ success: false, message: "DB 오류" });
  }
});

module.exports = router;
