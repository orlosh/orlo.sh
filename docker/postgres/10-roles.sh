#!/bin/sh
# Se ejecuta una vez, en el primer arranque del contenedor (docker-entrypoint-initdb.d), y en CI.
# Crea dos roles para que la app en ejecución nunca pueda alterar el esquema:
#   portfolio_owner  propietario de la base de datos; ejecuta las migraciones (DDL)
#   portfolio_app    lo usa la aplicación en runtime (solo DML)
# Con CREATE_TEST_DB=true se crea además <DB_NAME>_test con los mismos permisos
# (desarrollo local y tests de integración en CI).
set -eu

: "${DB_OWNER_PASSWORD:?DB_OWNER_PASSWORD is required}"
: "${DB_APP_PASSWORD:?DB_APP_PASSWORD is required}"
DB_NAME="${DB_NAME:-portfolio}"
PSQL="psql -v ON_ERROR_STOP=1 --username ${POSTGRES_USER:-postgres}"

$PSQL --dbname postgres -v owner_pw="$DB_OWNER_PASSWORD" -v app_pw="$DB_APP_PASSWORD" <<'SQL'
CREATE ROLE portfolio_owner LOGIN PASSWORD :'owner_pw';
CREATE ROLE portfolio_app   LOGIN PASSWORD :'app_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
SQL

setup_db() {
  $PSQL --dbname postgres -v db_name="$1" <<'SQL'
CREATE DATABASE :"db_name" OWNER portfolio_owner;
REVOKE ALL ON DATABASE :"db_name" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db_name" TO portfolio_app;
SQL
  $PSQL --dbname "$1" <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO portfolio_app;
-- Las tablas que cree después el propietario (migraciones) las puede usar automáticamente el
-- rol de la app.
ALTER DEFAULT PRIVILEGES FOR ROLE portfolio_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO portfolio_app;
ALTER DEFAULT PRIVILEGES FOR ROLE portfolio_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO portfolio_app;
SQL
}

setup_db "$DB_NAME"
if [ "${CREATE_TEST_DB:-false}" = "true" ]; then
  setup_db "${DB_NAME}_test"
fi
