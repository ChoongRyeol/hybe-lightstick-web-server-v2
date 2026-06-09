USE lightstickv2_catalog;

CREATE TABLE IF NOT EXISTS ble_config (
  id int(11) NOT NULL AUTO_INCREMENT,
  rssi_min int(11) NOT NULL DEFAULT -85,
  created_at timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS current_config (
  id int(11) NOT NULL AUTO_INCREMENT,
  created_at datetime NOT NULL DEFAULT current_timestamp(),
  low_current_min decimal(10,3) NOT NULL DEFAULT 10.000,
  low_current_max decimal(10,3) NOT NULL DEFAULT 30.000,
  high_current_min decimal(10,3) NOT NULL DEFAULT 80.000,
  high_current_max decimal(10,3) NOT NULL DEFAULT 200.000,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
