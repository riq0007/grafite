-- Fundação do isolamento por organização (spec isolamento-organizacoes).
CREATE SCHEMA app;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO grafite_app;
--> statement-breakpoint
-- Organização do contexto da transação. Nula quando não definida (falha fechada):
-- depois de um set_config local, o valor volta a '' e não a NULL, daí o nullif.
CREATE FUNCTION app.current_org() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;
--> statement-breakpoint
-- Ativa e força o RLS e cria a política de isolamento numa tabela com org_id.
-- Toda migration que cria tabela de negócio chama esta função.
CREATE FUNCTION app.isolar_por_organizacao(tabela regclass) RETURNS void
  LANGUAGE plpgsql
  AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tabela);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tabela);
  EXECUTE format(
    'CREATE POLICY isolamento_por_organizacao ON %s USING (org_id = app.current_org()) WITH CHECK (org_id = app.current_org())',
    tabela
  );
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app.isolar_por_organizacao(regclass) FROM PUBLIC;
