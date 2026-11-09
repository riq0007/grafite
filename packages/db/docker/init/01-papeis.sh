#!/bin/sh
# Papéis do banco (spec isolamento-organizacoes, "Papéis de banco separados").
# grafite_owner: dono das tabelas, usado só pelas migrations.
# grafite_app: usado pela aplicação; não é dono, não tem BYPASSRLS e não cria nada.
# grafite_backup: só lê, por cima do RLS, para o backup copiar o banco inteiro (design do F2d,
#   decisão 11). Criado só com GRAFITE_DB_BACKUP_PASSWORD; a leitura vem da migration 0017.
set -eu

psql -v ON_ERROR_STOP=1 \
  -v senha_owner="$GRAFITE_DB_OWNER_PASSWORD" \
  -v senha_app="$GRAFITE_DB_APP_PASSWORD" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'EOSQL'
CREATE ROLE grafite_owner LOGIN PASSWORD :'senha_owner'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE grafite_app LOGIN PASSWORD :'senha_app'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

ALTER DATABASE grafite OWNER TO grafite_owner;
REVOKE ALL ON DATABASE grafite FROM PUBLIC;
GRANT CONNECT ON DATABASE grafite TO grafite_app;

ALTER SCHEMA public OWNER TO grafite_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO grafite_app;

ALTER DEFAULT PRIVILEGES FOR ROLE grafite_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO grafite_app;
ALTER DEFAULT PRIVILEGES FOR ROLE grafite_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO grafite_app;
EOSQL

if [ -n "${GRAFITE_DB_BACKUP_PASSWORD:-}" ]; then
  psql -v ON_ERROR_STOP=1 \
    -v senha_backup="$GRAFITE_DB_BACKUP_PASSWORD" \
    --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'EOSQL'
CREATE ROLE grafite_backup LOGIN PASSWORD :'senha_backup'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
GRANT CONNECT ON DATABASE grafite TO grafite_backup;
EOSQL
fi
