-- Os consumíveis da organização (spec consumiveis; change p4b-consumiveis, design, decisão 2): o
-- catálogo com o código normalizado único, os fornecedores de cada consumível e os modelos em que ele
-- serve, isolados pela organização.
CREATE TABLE "consumiveis" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"codigo_normalizado" text NOT NULL,
	"nome" text,
	"nome_normalizado" text,
	"tipo" text NOT NULL,
	"cor" text,
	"rendimento" integer,
	"situacao" text DEFAULT 'ativo' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consumiveis_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "consumiveis_codigo_unico" UNIQUE("org_id","codigo_normalizado"),
	CONSTRAINT "consumiveis_codigo_valido" CHECK (length(trim("consumiveis"."codigo")) between 1 and 40 and length("consumiveis"."codigo_normalizado") > 0),
	CONSTRAINT "consumiveis_nome_valido" CHECK (("consumiveis"."nome" is null and "consumiveis"."nome_normalizado" is null)
        or (length(trim("consumiveis"."nome")) between 1 and 80 and "consumiveis"."nome_normalizado" is not null)),
	CONSTRAINT "consumiveis_tipo_valido" CHECK ("consumiveis"."tipo" in ('toner', 'cilindro', 'tinta', 'fita', 'kit-de-manutencao', 'outro')),
	CONSTRAINT "consumiveis_cor_valida" CHECK ("consumiveis"."cor" is null or "consumiveis"."cor" in ('preto', 'ciano', 'magenta', 'amarelo', 'colorido')),
	CONSTRAINT "consumiveis_rendimento_valido" CHECK ("consumiveis"."rendimento" is null or "consumiveis"."rendimento" between 1 and 1000000),
	CONSTRAINT "consumiveis_situacao_valida" CHECK ("consumiveis"."situacao" in ('ativo', 'inativo'))
);
--> statement-breakpoint
CREATE TABLE "consumiveis_dos_modelos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"consumivel_id" uuid NOT NULL,
	"modelo_id" uuid NOT NULL,
	CONSTRAINT "consumiveis_dos_modelos_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "consumiveis_dos_modelos_unico" UNIQUE("org_id","consumivel_id","modelo_id")
);
--> statement-breakpoint
CREATE TABLE "fornecedores_dos_consumiveis" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"consumivel_id" uuid NOT NULL,
	"fornecedor_id" uuid NOT NULL,
	CONSTRAINT "fornecedores_dos_consumiveis_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "fornecedores_dos_consumiveis_unico" UNIQUE("org_id","consumivel_id","fornecedor_id")
);
--> statement-breakpoint
ALTER TABLE "consumiveis" ADD CONSTRAINT "consumiveis_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumiveis_dos_modelos" ADD CONSTRAINT "consumiveis_dos_modelos_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumiveis_dos_modelos" ADD CONSTRAINT "consumiveis_dos_modelos_consumivel_fk" FOREIGN KEY ("org_id","consumivel_id") REFERENCES "public"."consumiveis"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumiveis_dos_modelos" ADD CONSTRAINT "consumiveis_dos_modelos_modelo_fk" FOREIGN KEY ("org_id","modelo_id") REFERENCES "public"."modelos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedores_dos_consumiveis" ADD CONSTRAINT "fornecedores_dos_consumiveis_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedores_dos_consumiveis" ADD CONSTRAINT "fornecedores_dos_consumiveis_consumivel_fk" FOREIGN KEY ("org_id","consumivel_id") REFERENCES "public"."consumiveis"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedores_dos_consumiveis" ADD CONSTRAINT "fornecedores_dos_consumiveis_fornecedor_fk" FOREIGN KEY ("org_id","fornecedor_id") REFERENCES "public"."fornecedores"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consumiveis_dos_modelos_modelo_idx" ON "consumiveis_dos_modelos" USING btree ("org_id","modelo_id");--> statement-breakpoint
CREATE INDEX "fornecedores_dos_consumiveis_fornecedor_idx" ON "fornecedores_dos_consumiveis" USING btree ("org_id","fornecedor_id");--> statement-breakpoint
SELECT app.isolar_por_organizacao('consumiveis');--> statement-breakpoint
SELECT app.isolar_por_organizacao('fornecedores_dos_consumiveis');--> statement-breakpoint
SELECT app.isolar_por_organizacao('consumiveis_dos_modelos');
