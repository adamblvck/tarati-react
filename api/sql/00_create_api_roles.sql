-- Run this in your DB client while connected as an admin/superuser.
-- Replace both password placeholders before running:
--   **PWD DEV**
--   **PWD PRD**
DO
$$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tarati_api_dev') THEN
    EXECUTE format(
      'CREATE ROLE tarati_api_dev LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT PASSWORD %L',
      '**PWD DEV**'
    );
  ELSE
    EXECUTE format('ALTER ROLE tarati_api_dev WITH LOGIN PASSWORD %L', '**PWD DEV**');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tarati_api_prd') THEN
    EXECUTE format(
      'CREATE ROLE tarati_api_prd LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT PASSWORD %L',
      '**PWD PRD**'
    );
  ELSE
    EXECUTE format('ALTER ROLE tarati_api_prd WITH LOGIN PASSWORD %L', '**PWD PRD**');
  END IF;
END;
$$;
