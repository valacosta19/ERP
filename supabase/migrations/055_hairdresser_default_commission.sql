-- Default commission rate per professional, used to pre-fill commission when
-- assigning a professional to a service in the quick-load funnel.
ALTER TABLE hairdressers
  ADD COLUMN IF NOT EXISTS default_commission_rate numeric NOT NULL DEFAULT 0;
