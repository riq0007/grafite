-- As mudanças de cada conta sobre uma visão da organização ou a de fábrica (change visoes-da-conta,
-- design, decisão 1): a definição inteira, uma linha por conta, tabela e visão, e a remoção da visão
-- apaga as mudanças de todos sobre ela.
CREATE TABLE "mudancas_das_visoes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"tabela" text NOT NULL,
	"visao_id" uuid,
	"definicao" jsonb NOT NULL,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mudancas_das_visoes_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "mudancas_das_visoes_unicas" UNIQUE NULLS NOT DISTINCT("org_id","conta_id","tabela","visao_id"),
	CONSTRAINT "mudancas_das_visoes_tabela_valida" CHECK ("mudancas_das_visoes"."tabela" in ('ativos')),
	CONSTRAINT "mudancas_das_visoes_definicao_valida" CHECK (jsonb_typeof("mudancas_das_visoes"."definicao") = 'object' and octet_length("mudancas_das_visoes"."definicao"::text) <= 32768)
);
--> statement-breakpoint
ALTER TABLE "mudancas_das_visoes" ADD CONSTRAINT "mudancas_das_visoes_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mudancas_das_visoes" ADD CONSTRAINT "mudancas_das_visoes_conta_fk" FOREIGN KEY ("org_id","conta_id") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mudancas_das_visoes" ADD CONSTRAINT "mudancas_das_visoes_visao_fk" FOREIGN KEY ("org_id","visao_id") REFERENCES "public"."visoes"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mudancas_das_visoes_da_visao_idx" ON "mudancas_das_visoes" USING btree ("org_id","visao_id");--> statement-breakpoint
SELECT app.isolar_por_organizacao('mudancas_das_visoes');
