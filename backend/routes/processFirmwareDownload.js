const express = require("express");
const router = express.Router();

const { dataPool } = require("../db");
const { acquireRedisLock, releaseRedisLock } = require("../utils/redisLock");

function normalizeGuid(guid) {
  if (!guid) return null;

  if (Buffer.isBuffer(guid)) {
    const hex = guid.toString("hex").toUpperCase();
    return hex.length === 32 ? hex : null;
  }

  if (Array.isArray(guid)) {
    const hex = Buffer.from(guid).toString("hex").toUpperCase();
    return hex.length === 32 ? hex : null;
  }

  const hex = String(guid)
    .replace(/[^0-9A-Fa-f]/g, "")
    .toUpperCase();

  return hex.length === 32 ? hex : null;
}

router.post("/", async (req, res) => {
  const redis = req.app.locals.redisLockClient;
  const body = req.body || {};

  const line = body.line;
  const generatorName = body.generator_name || "TEMP";
  const serial = body.serial || null;
  const boardName = body.board_name || null;
  const result = String(body.result || "").toUpperCase();

  const rawDeviceGuid = body.device_guid;
  const normalizedGuid = normalizeGuid(rawDeviceGuid);

  if (!line || !result) {
    return res.status(400).json({
      success: false,
      result: "invalid_request",
      message: "line, result는 필수입니다.",
    });
  }

  if (!["PASS", "FAIL"].includes(result)) {
    return res.status(400).json({
      success: false,
      result: "invalid_request",
      message: "result는 PASS 또는 FAIL이어야 합니다.",
    });
  }

  // PASS는 실제 디바이스 READ GUID가 필수
  if (result === "PASS" && !normalizedGuid) {
    return res.status(400).json({
      success: false,
      result: "invalid_request",
      message: "PASS 결과는 32자리 device_guid HEX 값이 필수입니다.",
    });
  }

  // FAIL은 GUID 저장 의미 없음. 무조건 NULL 처리.
  const finalDeviceGuidHex = result === "PASS" ? normalizedGuid : null;
  const finalDeviceGuidBuffer = finalDeviceGuidHex
    ? Buffer.from(finalDeviceGuidHex, "hex")
    : null;

  // FAIL은 GUID가 없으므로 serial 기준 lock
  // PASS는 GUID 기준 lock
  const lockTarget = finalDeviceGuidHex || serial;
  const lockKey = `lock:firmware_download:${lockTarget}`;
  const lockValue = await acquireRedisLock(redis, lockKey, 10);

  if (!lockValue) {
    console.log(
      `[LOCK][FAIL] key=${lockKey} line=${line} serial=${serial} board=${boardName || "-"}`,
    );

    return res.status(409).json({
      success: false,
      result: "lock_busy",
      message: "같은 Device GUID 또는 Serial이 다른 라인에서 처리 중입니다.",
    });
  }

  let conn;

  try {
    conn = await dataPool.getConnection();
    await conn.beginTransaction();

    const [logResult] = await conn.query(
      `
      INSERT INTO process_firmware_download_log
      (
        line,
        generator_name,
        artist,
        lightstick,
        serial,
        device_guid,

        row_id,
        evk_time,
        write_check,
        board_name,
        result,

        disable_protect_flash_r,
        disable_protect_flash_v,
        erase_firmware_k_r,
        erase_firmware_k_v,

        calib_fre_offset_2498mhz_hz_r,
        calib_fre_offset_2498mhz_hz_v,
        tx_cnt_2498mhz_r,
        tx_cnt_2498mhz_v,
        rx_cnt_2498mhz_r,
        rx_cnt_2498mhz_v,
        tx_power_2498mhz_db_r,
        tx_power_2498mhz_db_v,
        rx_power_2498mhz_r,
        rx_power_2498mhz_v,

        calib_fre_offset_2398mhz_hz_r,
        calib_fre_offset_2398mhz_hz_v,
        tx_cnt_2398mhz_r,
        tx_cnt_2398mhz_v,
        rx_cnt_2398mhz_r,
        rx_cnt_2398mhz_v,
        tx_power_2398mhz_db_r,
        tx_power_2398mhz_db_v,
        rx_power_2398mhz_r,
        rx_power_2398mhz_v,

        erase_mac_k_r,
        erase_mac_k_v,
        write_firmware_err_addr_r,
        write_firmware_err_addr_v,
        write_mac_hb_r,
        write_mac_hb_v,
        write_mac_lb_r,
        write_mac_lb_v,
        write_freoffset_r,
        write_freoffset_v,

        check_firmware_err_addr_r,
        check_firmware_err_addr_v,
        check_mac_lb_r,
        check_mac_lb_v,
        read_mac_lb_value_r,
        read_mac_lb_value_v,
        check_freoffset_r,
        check_freoffset_v
      )
      VALUES
      (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?
      )
      `,
      [
        line,
        generatorName,
        body.artist || null,
        body.lightstick || null,
        serial,
        finalDeviceGuidBuffer,

        body.row_id || null,
        body.evk_time || body.time || null,
        body.result_check ?? 0,
        boardName,
        result,

        body.disable_protect_flash_r || null,
        body.disable_protect_flash_v || null,
        body.erase_firmware_k_r || null,
        body.erase_firmware_k_v || null,

        body.calib_fre_offset_2498mhz_hz_r || null,
        body.calib_fre_offset_2498mhz_hz_v || null,
        body.tx_cnt_2498mhz_r || null,
        body.tx_cnt_2498mhz_v || null,
        body.rx_cnt_2498mhz_r || null,
        body.rx_cnt_2498mhz_v || null,
        body.tx_power_2498mhz_db_r || null,
        body.tx_power_2498mhz_db_v || null,
        body.rx_power_2498mhz_r || null,
        body.rx_power_2498mhz_v || null,

        body.calib_fre_offset_2398mhz_hz_r || null,
        body.calib_fre_offset_2398mhz_hz_v || null,
        body.tx_cnt_2398mhz_r || null,
        body.tx_cnt_2398mhz_v || null,
        body.rx_cnt_2398mhz_r || null,
        body.rx_cnt_2398mhz_v || null,
        body.tx_power_2398mhz_db_r || null,
        body.tx_power_2398mhz_db_v || null,
        body.rx_power_2398mhz_r || null,
        body.rx_power_2398mhz_v || null,

        body.erase_mac_k_r || null,
        body.erase_mac_k_v || null,
        body.write_firmware_err_addr_r || null,
        body.write_firmware_err_addr_v || null,
        body.write_mac_hb_r || null,
        body.write_mac_hb_v || null,
        body.write_mac_lb_r || null,
        body.write_mac_lb_v || null,
        body.write_freoffset_r || null,
        body.write_freoffset_v || null,

        body.check_firmware_err_addr_r || null,
        body.check_firmware_err_addr_v || null,
        body.check_mac_lb_r || null,
        body.check_mac_lb_v || null,
        body.read_mac_lb_value_r || null,
        body.read_mac_lb_value_v || null,
        body.check_freoffset_r || null,
        body.check_freoffset_v || null,
      ],
    );

    const logId = logResult.insertId;

    if (result === "PASS") {
      try {
        await conn.query(
          `
          INSERT INTO process_firmware_download
          (
            line,
            generator_name,
            artist,
            lightstick,
            serial,
            device_guid,
            board_name,
            last_log_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            line,
            generatorName,
            body.artist || null,
            body.lightstick || null,
            serial,
            finalDeviceGuidBuffer,
            boardName,
            logId,
          ],
        );
      } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
          await conn.rollback();

          return res.status(409).json({
            success: false,
            result: "duplicated_guid",
            message: "이미 PASS 저장된 Device GUID입니다.",
            detail: err.message,
            log_id: logId,
          });
        }

        throw err;
      }
    }

    await conn.commit();

    return res.json({
      success: true,
      result,
      log_id: logId,
      registered: result === "PASS",
      device_guid: finalDeviceGuidHex,
      message:
        result === "PASS"
          ? "펌웨어 다운로드 PASS 저장 완료"
          : "펌웨어 다운로드 FAIL 로그 저장 완료",
    });
  } catch (err) {
    if (conn) {
      await conn.rollback();
    }

    console.error("[processFirmwareDownload] ERROR:", err);

    return res.status(500).json({
      success: false,
      result: "error",
      message: "펌웨어 다운로드 로그 저장 실패",
      detail: err.message,
    });
  } finally {
    if (conn) {
      conn.release();
    }

    await releaseRedisLock(redis, lockKey, lockValue).catch(() => {});

    console.log(
      `[LOCK][RELEASE] key=${lockKey} line=${line} serial=${serial} board=${boardName || "-"}`,
    );
  }
});

module.exports = router;
