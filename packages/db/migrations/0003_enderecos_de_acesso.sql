CREATE TABLE "enderecos_de_acesso" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"endereco" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enderecos_de_acesso_endereco_unico" UNIQUE("endereco"),
	CONSTRAINT "enderecos_de_acesso_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "enderecos_de_acesso_endereco_normalizado" CHECK ("enderecos_de_acesso"."endereco" ~ '^[a-z0-9:._-]+$' and "enderecos_de_acesso"."endereco" !~ '^[^:]*:[^:]*$' and right("enderecos_de_acesso"."endereco", 1) <> '.')
);
--> statement-breakpoint
ALTER TABLE "enderecos_de_acesso" ADD CONSTRAINT "enderecos_de_acesso_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Isolamento por organização (spec isolamento-organizacoes).
SELECT app.isolar_por_organizacao('enderecos_de_acesso');
--> statement-breakpoint
-- A descoberta da organização pelo endereço é a única consulta que atravessa organizações. Como o
-- RLS é forçado, a função, do dono, lê a tabela por uma política só do dono. O dono já pode desligar
-- o RLS das próprias tabelas, então a política não lhe dá nada novo, e o grafite_app fica sem ela.
CREATE POLICY resolucao_de_endereco ON enderecos_de_acesso FOR SELECT TO grafite_owner USING (true);
--> statement-breakpoint
-- Devolve só a organização de um endereço exato: não lista endereços nem organizações.
CREATE FUNCTION app.organizacao_do_endereco(p_endereco text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$ SELECT org_id FROM public.enderecos_de_acesso WHERE endereco = p_endereco $$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app.organizacao_do_endereco(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.organizacao_do_endereco(text) TO grafite_app;
