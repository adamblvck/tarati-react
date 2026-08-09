-- Run this in your DB client while connected to database: tarati_dev
-- Grants least-privilege runtime access for the dev API user.
DO
$$
BEGIN
  IF current_database() <> 'tarati_dev' THEN
    RAISE EXCEPTION 'Connect to tarati_dev before running this script. Current DB: %', current_database();
  END IF;
END;
$$;

GRANT CONNECT ON DATABASE tarati_dev TO tarati_api_dev;

GRANT USAGE ON SCHEMA public TO tarati_api_dev;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tarati_api_dev;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tarati_api_dev;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO tarati_api_dev;

-- Ensure future objects in public schema are also accessible.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tarati_api_dev;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO tarati_api_dev;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO tarati_api_dev;
