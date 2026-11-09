-- As visões de tabela (spec visoes-de-tabela; design do P1c, decisão 5): a da organização sem conta e
-- a de uma conta com ela, o nome único entre as da organização e, à parte, entre as de cada conta, e
-- a definição como objeto de até 32 KB.
CREATE TABLE "visoes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"tabela" text NOT NULL,
	"conta_id" uuid,
	"nome" text NOT NULL,
	"nome_normalizado" text NOT NULL,
	"definicao" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visoes_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "visoes_tabela_valida" CHECK ("visoes"."tabela" in ('ativos')),
	CONSTRAINT "visoes_definicao_valida" CHECK (jsonb_typeof("visoes"."definicao") = 'object' and octet_length("visoes"."definicao"::text) <= 32768)
);
--> statement-breakpoint
ALTER TABLE "visoes" ADD CONSTRAINT "visoes_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visoes" ADD CONSTRAINT "visoes_conta_fk" FOREIGN KEY ("org_id","conta_id") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "visoes_nome_da_organizacao_unico" ON "visoes" USING btree ("org_id","tabela","nome_normalizado") WHERE "visoes"."conta_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "visoes_nome_da_conta_unico" ON "visoes" USING btree ("org_id","tabela","conta_id","nome_normalizado") WHERE "visoes"."conta_id" is not null;--> statement-breakpoint
CREATE INDEX "visoes_da_conta_idx" ON "visoes" USING btree ("org_id","tabela","conta_id");--> statement-breakpoint
-- Isolamento por organização (spec isolamento-organizacoes).
SELECT app.isolar_por_organizacao('visoes');
