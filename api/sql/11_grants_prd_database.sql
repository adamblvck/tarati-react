-- Run this in your DB client while connected to database: tarati_prd
-- Grants least-privilege runtime access for the production API user.
DO
$$
BEGIN
  IF current_database() <> 'tarati_prd' THEN
    RAISE EXCEPTION 'Connect to tarati_prd before running this script. Current DB: %', current_database();
  END IF;
END;
$$;

GRANT CONNECT ON DATABASE tarati_prd TO tarati_api_prd;

GRANT USAGE ON SCHEMA public TO tarati_api_prd;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tarati_api_prd;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tarati_api_prd;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO tarati_api_prd;

-- Ensure future objects in public schema are also accessible.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tarati_api_prd;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO tarati_api_prd;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO tarati_api_prd;
