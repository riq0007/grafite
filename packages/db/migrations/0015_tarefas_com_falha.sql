-- As tarefas com falha de cada organização e a lista das organizações para as tarefas (specs
-- fila-de-tarefas e isolamento-organizacoes; design do F2c, decisões 15 e 16).
CREATE TABLE "tarefas_com_falha" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"tarefa" text NOT NULL,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tentativas" integer NOT NULL,
	"erro" text NOT NULL,
	"falhou_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tarefas_com_falha_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "tarefas_com_falha_tarefa_valida" CHECK ("tarefas_com_falha"."tarefa" ~ '^[a-z][a-z-]{0,99}$'),
	CONSTRAINT "tarefas_com_falha_dados_validos" CHECK (jsonb_typeof("tarefas_com_falha"."dados") = 'object' and octet_length("tarefas_com_falha"."dados"::text) <= 2048),
	CONSTRAINT "tarefas_com_falha_tentativas" CHECK ("tarefas_com_falha"."tentativas" >= 1),
	CONSTRAINT "tarefas_com_falha_erro_curto" CHECK (length("tarefas_com_falha"."erro") between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "tarefas_com_falha" ADD CONSTRAINT "tarefas_com_falha_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tarefas_com_falha_lista_idx" ON "tarefas_com_falha" USING btree ("org_id","falhou_em" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
-- Isolamento por organização (spec isolamento-organizacoes).
SELECT app.isolar_por_organizacao('tarefas_com_falha');
--> statement-breakpoint
-- A lista das organizações para as tarefas de cada uma, como a manutenção diária, é a segunda
-- consulta que atravessa organizações. Como na descoberta pelo endereço (migration 0003), a
-- função, do dono, lê a tabela por uma política só do dono, e devolve só os identificadores.
CREATE POLICY lista_para_tarefas ON organizacoes FOR SELECT TO grafite_owner USING (true);
--> statement-breakpoint
CREATE FUNCTION app.organizacoes_para_tarefas() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$ SELECT id FROM public.organizacoes ORDER BY id $$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app.organizacoes_para_tarefas() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.organizacoes_para_tarefas() TO grafite_app;
