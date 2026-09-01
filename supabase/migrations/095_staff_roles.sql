-- Roles de las profesionales (peluquera, asistente, administrativa, …).
-- Editables desde Ajustes: definen quién aparece al cargar servicios y quién
-- genera comisión.

CREATE TABLE IF NOT EXISTS staff_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  assigns_services boolean NOT NULL DEFAULT true,
  earns_commission boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE staff_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read staff_roles" ON staff_roles;
CREATE POLICY "authenticated read staff_roles" ON staff_roles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin manage staff_roles" ON staff_roles;
CREATE POLICY "admin manage staff_roles" ON staff_roles
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

INSERT INTO staff_roles (name, assigns_services, earns_commission) VALUES
  ('Peluquera', true, true),
  ('Asistente', true, true),
  ('Administrativa', false, false)
ON CONFLICT (name) DO NOTHING;

-- NULL = sin rol asignado: se comporta como hoy (aparece al cargar y comisiona).
ALTER TABLE hairdressers
  ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES staff_roles(id) ON DELETE SET NULL;
