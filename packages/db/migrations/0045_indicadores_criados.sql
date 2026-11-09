CREATE TABLE "indicadores_criados" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"nome_normalizado" text NOT NULL,
	"medida" text NOT NULL,
	"tipo_id" uuid,
	"modelo_id" uuid,
	"local_id" uuid,
	"meta" integer NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicadores_criados_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "indicadores_criados_nome_unico" UNIQUE("org_id","nome_normalizado"),
	CONSTRAINT "indicadores_criados_nome_valido" CHECK (length(trim("indicadores_criados"."nome")) between 1 and 80),
	CONSTRAINT "indicadores_criados_medida_valida" CHECK ("indicadores_criados"."medida" in ('toner', 'critico', 'disponibilidade', 'que-voltam', 'backups-do-control-id')),
	CONSTRAINT "indicadores_criados_tipo_ou_modelo" CHECK ("indicadores_criados"."tipo_id" is null or "indicadores_criados"."modelo_id" is null),
	CONSTRAINT "indicadores_criados_meta_valida" CHECK ("indicadores_criados"."meta" > 0)
);
--> statement-breakpoint
ALTER TABLE "indicadores_criados" ADD CONSTRAINT "indicadores_criados_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicadores_criados" ADD CONSTRAINT "indicadores_criados_tipo_fk" FOREIGN KEY ("org_id","tipo_id") REFERENCES "public"."tipos_de_ativo"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicadores_criados" ADD CONSTRAINT "indicadores_criados_modelo_fk" FOREIGN KEY ("org_id","modelo_id") REFERENCES "public"."modelos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicadores_criados" ADD CONSTRAINT "indicadores_criados_local_fk" FOREIGN KEY ("org_id","local_id") REFERENCES "public"."locais"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicadores_criados" ADD CONSTRAINT "indicadores_criados_criado_por_fk" FOREIGN KEY ("org_id","criado_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
SELECT app.isolar_por_organizacao('indicadores_criados');
