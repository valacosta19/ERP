CREATE TABLE hairdresser_services (
  hairdresser_id  UUID NOT NULL REFERENCES hairdressers(id) ON DELETE CASCADE,
  catalog_item_id UUID NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  commission_rate NUMERIC NOT NULL CHECK (commission_rate >= 0 AND commission_rate <= 100),
  PRIMARY KEY (hairdresser_id, catalog_item_id)
);

CREATE INDEX idx_hairdresser_services_catalog_item ON hairdresser_services (catalog_item_id);

ALTER TABLE hairdresser_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read hairdresser_services"
  ON hairdresser_services FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "admin insert hairdresser_services"
  ON hairdresser_services FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "admin update hairdresser_services"
  ON hairdresser_services FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "admin delete hairdresser_services"
  ON hairdresser_services FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
