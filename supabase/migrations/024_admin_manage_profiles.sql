-- Allow admins to update any profile (e.g. change role)
CREATE POLICY "admin_profiles_update" ON profiles FOR UPDATE TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');
