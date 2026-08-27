-- SKU automático: si no se escribe a mano, se genera en la base.
-- Formato: tres letras del nombre + número secuencial global (ej. TIN-0042),
-- misma convención que usaba el importador de Excel en el navegador.
-- Se genera en la DB para que nunca haya colisión entre inserts concurrentes
-- ni entre el importador y los formularios.

CREATE SEQUENCE IF NOT EXISTS product_sku_seq START 1;

CREATE OR REPLACE FUNCTION set_product_sku()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
BEGIN
  IF NEW.sku IS NOT NULL AND btrim(NEW.sku) <> '' THEN
    NEW.sku := btrim(NEW.sku);
    RETURN NEW;
  END IF;

  v_prefix := upper(regexp_replace(COALESCE(NEW.name, ''), '[^A-Za-z]', '', 'g'));
  v_prefix := rpad(left(v_prefix, 3), 3, 'X');

  -- La secuencia es global, así que el sufijo nunca se repite. El loop cubre
  -- el caso de un SKU cargado a mano que ya ocupe el código generado.
  LOOP
    NEW.sku := v_prefix || '-' || lpad(nextval('product_sku_seq')::text, 4, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM products WHERE sku = NEW.sku);
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_product_sku ON products;
CREATE TRIGGER trg_set_product_sku
  BEFORE INSERT OR UPDATE OF sku, name ON products
  FOR EACH ROW
  EXECUTE FUNCTION set_product_sku();

-- Completar los productos que hoy tengan el SKU en blanco. El NULL lo llena el
-- trigger antes de que se valide el NOT NULL de la columna.
UPDATE products SET sku = NULL WHERE btrim(sku) = '';
