DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_available_extensions
    WHERE name = 'pgroonga'
  ) THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pgroonga';
  ELSE
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_trgm';
  END IF;
END $$;
