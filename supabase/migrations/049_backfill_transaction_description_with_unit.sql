UPDATE transactions t
SET description = p.name || ' ' || p.unit
FROM products p
WHERE btrim(t.description) = p.name
  AND p.unit IS NOT NULL
  AND btrim(p.unit) <> '';
