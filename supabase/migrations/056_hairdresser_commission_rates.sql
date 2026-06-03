-- A professional can have multiple commission rates depending on the service.
-- Replaces the single default_commission_rate (055) with a list; the funnel
-- asks which rate applies when assigning the professional.
-- Run 055 first if you haven't yet.
ALTER TABLE hairdressers
  ADD COLUMN IF NOT EXISTS commission_rates numeric[] NOT NULL DEFAULT '{}';

UPDATE hairdressers
SET commission_rates = ARRAY[default_commission_rate]
WHERE default_commission_rate > 0 AND commission_rates = '{}';

ALTER TABLE hairdressers DROP COLUMN IF EXISTS default_commission_rate;
