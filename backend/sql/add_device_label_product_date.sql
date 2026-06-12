ALTER TABLE `device_label_print_logs`
  ADD COLUMN IF NOT EXISTS `product_date` varchar(7) DEFAULT NULL
  AFTER `certification_info`;

ALTER TABLE `device_label_print_logs`
  MODIFY COLUMN `product_date` varchar(7) DEFAULT NULL;

ALTER TABLE `device_label_print_logs_backup`
  ADD COLUMN IF NOT EXISTS `product_date` varchar(7) DEFAULT NULL
  AFTER `certification_info`;

ALTER TABLE `device_label_print_logs_backup`
  MODIFY COLUMN `product_date` varchar(7) DEFAULT NULL;
