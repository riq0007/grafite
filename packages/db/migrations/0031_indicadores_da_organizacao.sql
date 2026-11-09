-- Os indicadores da organização e o índice dos alertas pela abertura (change p3d-indicadores,
-- design, decisões 1 e 3): a meta escolhida de cada indicador, com quem a mudou e quando, e a marca
-- da avaliação diária, isoladas pela organização; os indicadores leem os alertas que abriram nos
-- últimos 60 dias.
CREATE TABLE "indicadores_da_organizacao" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"indicador" text NOT NULL,
	"meta" integer,
	"meta_alterada_em" timestamp with time zone,
	"meta_alterada_por" uuid,
	"fora_da_meta_desde" timestamp with time zone,
	CONSTRAINT "indicadores_da_organizacao_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "indicadores_da_organizacao_indicador_unico" UNIQUE("org_id","indicador"),
	CONSTRAINT "indicadores_da_organizacao_indicador_valido" CHECK ("indicadores_da_organizacao"."indicador" in ('toner', 'critico', 'disponibilidade', 'que-voltam')),
	CONSTRAINT "indicadores_da_organizacao_meta_valida" CHECK ("indicadores_da_organizacao"."meta" is null or "indicadores_da_organizacao"."meta" > 0)
);
--> statement-breakpoint
ALTER TABLE "indicadores_da_organizacao" ADD CONSTRAINT "indicadores_da_organizacao_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicadores_da_organizacao" ADD CONSTRAINT "indicadores_da_organizacao_alterada_por_fk" FOREIGN KEY ("org_id","meta_alterada_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alertas_aberto_em_idx" ON "alertas" USING btree ("org_id","aberto_em") WHERE "alertas"."aberto_em" is not null;--> statement-breakpoint
SELECT app.isolar_por_organizacao('indicadores_da_organizacao');
