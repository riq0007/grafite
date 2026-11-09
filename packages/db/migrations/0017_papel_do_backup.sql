-- A leitura do papel do backup (spec isolamento-organizacoes, "Papéis de banco separados"; design
-- do F2d, decisão 11). O grafite_backup tem BYPASSRLS e nenhuma escrita: só o processo que copia o
-- banco o usa. Quem tem o superusuário cria o papel (o instalador, o pnpm dev e o banco dos
-- testes); a função dá a leitura se ele existir, aqui e de novo quando ele for criado depois das
-- migrations. Um esquema novo, numa migration futura, chama a função de novo.
CREATE FUNCTION app.conceder_leitura_ao_backup() RETURNS void
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
  AS $$
DECLARE
  esquema text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grafite_backup') THEN
    RETURN;
  END IF;
  FOR esquema IN
    SELECT nspname FROM pg_namespace
     WHERE nspname IN ('public', 'fila', 'operacao', 'drizzle')
     ORDER BY nspname
  LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO grafite_backup', esquema);
    EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA %I TO grafite_backup', esquema);
    EXECUTE format('GRANT SELECT ON ALL SEQUENCES IN SCHEMA %I TO grafite_backup', esquema);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE grafite_owner IN SCHEMA %I GRANT SELECT ON TABLES TO grafite_backup',
      esquema);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE grafite_owner IN SCHEMA %I GRANT SELECT ON SEQUENCES TO grafite_backup',
      esquema);
  END LOOP;
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app.conceder_leitura_ao_backup() FROM PUBLIC;
--> statement-breakpoint
SELECT app.conceder_leitura_ao_backup();
