CREATE TABLE IF NOT EXISTS process_generated_macs_backup_summary (
  generator_name VARCHAR(255) NOT NULL,
  start_mac VARCHAR(32) NULL,
  end_mac VARCHAR(32) NULL,
  start_mac_decimal BIGINT UNSIGNED NULL,
  end_mac_decimal BIGINT UNSIGNED NULL,
  expected_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  total_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  distinct_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  duplicate_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  missing_count BIGINT NOT NULL DEFAULT 0,
  is_continuous VARCHAR(8) NOT NULL DEFAULT 'NO',
  serial_start VARCHAR(128) NULL,
  serial_end VARCHAR(128) NULL,
  serial_start_num BIGINT UNSIGNED NULL,
  serial_end_num BIGINT UNSIGNED NULL,
  artist VARCHAR(255) NULL,
  lightstick VARCHAR(255) NULL,
  fw_version VARCHAR(255) NULL,
  device_name VARCHAR(255) NULL,
  model VARCHAR(255) NULL,
  certification_info TEXT NULL,
  is_hidden TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (generator_name),
  INDEX idx_pgmb_summary_created_at (created_at),
  INDEX idx_pgmb_summary_hidden_created (is_hidden, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO process_generated_macs_backup_summary (
  generator_name,
  start_mac,
  end_mac,
  start_mac_decimal,
  end_mac_decimal,
  expected_count,
  total_count,
  distinct_count,
  duplicate_count,
  missing_count,
  is_continuous,
  serial_start,
  serial_end,
  serial_start_num,
  serial_end_num,
  artist,
  lightstick,
  fw_version,
  device_name,
  model,
  certification_info,
  is_hidden,
  created_at
)
WITH mac_with_decimal AS (
  SELECT
    generator_name,
    mac_address,
    CAST(CONV(REPLACE(mac_address, ':', ''), 16, 10) AS UNSIGNED) AS mac_decimal
  FROM process_generated_macs_backup
),
mac_agg AS (
  SELECT
    generator_name,
    MIN(mac_decimal) AS min_dec,
    MAX(mac_decimal) AS max_dec,
    COUNT(*) AS total_count,
    COUNT(DISTINCT mac_decimal) AS distinct_count
  FROM mac_with_decimal
  GROUP BY generator_name
),
mac_start_end AS (
  SELECT
    a.generator_name,
    (
      SELECT m.mac_address
      FROM mac_with_decimal m
      WHERE m.generator_name = a.generator_name
        AND m.mac_decimal = a.min_dec
      LIMIT 1
    ) AS start_mac,
    (
      SELECT m.mac_address
      FROM mac_with_decimal m
      WHERE m.generator_name = a.generator_name
        AND m.mac_decimal = a.max_dec
      LIMIT 1
    ) AS end_mac,
    a.min_dec AS start_decimal,
    a.max_dec AS end_decimal,
    (a.max_dec - a.min_dec + 1) AS expected_count,
    a.total_count,
    a.distinct_count,
    (a.total_count - a.distinct_count) AS duplicate_count,
    ((a.max_dec - a.min_dec + 1) - a.distinct_count) AS missing_count,
    CASE
      WHEN a.distinct_count = (a.max_dec - a.min_dec + 1) THEN 'YES'
      ELSE 'NO'
    END AS is_continuous
  FROM mac_agg a
),
serial_with_num AS (
  SELECT
    generator_name,
    serial,
    CAST(REGEXP_SUBSTR(serial, '[0-9]+$') AS UNSIGNED) AS serial_num
  FROM process_generated_macs_backup
  WHERE serial IS NOT NULL
    AND TRIM(serial) <> ''
    AND REGEXP_SUBSTR(serial, '[0-9]+$') IS NOT NULL
),
serial_agg AS (
  SELECT
    generator_name,
    MIN(serial_num) AS min_serial_num,
    MAX(serial_num) AS max_serial_num
  FROM serial_with_num
  GROUP BY generator_name
),
serial_start_end AS (
  SELECT
    a.generator_name,
    (
      SELECT s.serial
      FROM serial_with_num s
      WHERE s.generator_name = a.generator_name
        AND s.serial_num = a.min_serial_num
      LIMIT 1
    ) AS serial_start,
    (
      SELECT s.serial
      FROM serial_with_num s
      WHERE s.generator_name = a.generator_name
        AND s.serial_num = a.max_serial_num
      LIMIT 1
    ) AS serial_end,
    a.min_serial_num AS serial_start_num,
    a.max_serial_num AS serial_end_num
  FROM serial_agg a
),
latest_meta AS (
  SELECT
    generator_name,
    MIN(artist) AS artist,
    MIN(lightstick) AS lightstick,
    MIN(fw_version) AS fw_version,
    MIN(device_name) AS device_name,
    MIN(model) AS model,
    MIN(certification_info) AS certification_info,
    MAX(created_at) AS created_at,
    MAX(is_hidden) AS is_hidden
  FROM process_generated_macs_backup
  GROUP BY generator_name
)
SELECT
  mse.generator_name,
  mse.start_mac,
  mse.end_mac,
  mse.start_decimal,
  mse.end_decimal,
  mse.expected_count,
  mse.total_count,
  mse.distinct_count,
  mse.duplicate_count,
  mse.missing_count,
  mse.is_continuous,
  sse.serial_start,
  sse.serial_end,
  sse.serial_start_num,
  sse.serial_end_num,
  lm.artist,
  lm.lightstick,
  lm.fw_version,
  lm.device_name,
  lm.model,
  lm.certification_info,
  lm.is_hidden,
  lm.created_at
FROM mac_start_end mse
LEFT JOIN serial_start_end sse
  ON mse.generator_name = sse.generator_name
LEFT JOIN latest_meta lm
  ON mse.generator_name = lm.generator_name
ON DUPLICATE KEY UPDATE
  start_mac = VALUES(start_mac),
  end_mac = VALUES(end_mac),
  start_mac_decimal = VALUES(start_mac_decimal),
  end_mac_decimal = VALUES(end_mac_decimal),
  expected_count = VALUES(expected_count),
  total_count = VALUES(total_count),
  distinct_count = VALUES(distinct_count),
  duplicate_count = VALUES(duplicate_count),
  missing_count = VALUES(missing_count),
  is_continuous = VALUES(is_continuous),
  serial_start = VALUES(serial_start),
  serial_end = VALUES(serial_end),
  serial_start_num = VALUES(serial_start_num),
  serial_end_num = VALUES(serial_end_num),
  artist = VALUES(artist),
  lightstick = VALUES(lightstick),
  fw_version = VALUES(fw_version),
  device_name = VALUES(device_name),
  model = VALUES(model),
  certification_info = VALUES(certification_info),
  is_hidden = VALUES(is_hidden),
  created_at = VALUES(created_at),
  updated_at = CURRENT_TIMESTAMP(6);
