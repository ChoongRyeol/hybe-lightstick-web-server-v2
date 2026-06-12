ALTER TABLE `device_label_print_logs`
  ADD COLUMN IF NOT EXISTS `product_date` varchar(6) DEFAULT NULL
  AFTER `certification_info`;

ALTER TABLE `device_label_print_logs_backup`
  ADD COLUMN IF NOT EXISTS `product_date` varchar(6) DEFAULT NULL
  AFTER `certification_info`;
