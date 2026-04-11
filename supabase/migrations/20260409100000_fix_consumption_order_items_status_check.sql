-- Fix consumption_order_items status check constraint to include all required values
ALTER TABLE consumption_order_items
  DROP CONSTRAINT IF EXISTS consumption_order_items_status_check;

ALTER TABLE consumption_order_items
  ADD CONSTRAINT consumption_order_items_status_check
    CHECK (status IN ('pending', 'inactive', 'active', 'used', 'cancelled', 'expired'));
