-- Os ativos (spec cadastro-de-ativos; design do P1b, decisões 1 e 12): os campos comuns que o banco
-- garante ou filtra em colunas, os outros valores e o estado de cada campo em JSONB, o modelo preso
-- ao tipo do ativo, e os módulos opcionais que cada organização desligou.
CREATE TABLE "ativos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"tipo_id" uuid NOT NULL,
	"modelo_id" uuid,
	"nome" text,
	"patrimonio" text,
	"patrimonio_normalizado" text,
	"serie" text,
	"hostname" text,
	"uso" text DEFAULT 'em-uso' NOT NULL,
	"local_id" uuid,
	"responsavel_id" uuid,
	"valores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"estado" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"busca" text NOT NULL,
	"situacao" text DEFAULT 'ativo' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ativos_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "ativos_patrimonio_unico" UNIQUE("org_id","patrimonio_normalizado"),
	CONSTRAINT "ativos_uso_valido" CHECK ("ativos"."uso" in ('em-uso', 'em-estoque', 'em-manutencao')),
	CONSTRAINT "ativos_situacao_valida" CHECK ("ativos"."situacao" in ('ativo', 'inativo')),
	CONSTRAINT "ativos_valores_validos" CHECK (jsonb_typeof("ativos"."valores") = 'object' and octet_length("ativos"."valores"::text) <= 262144),
	CONSTRAINT "ativos_estado_valido" CHECK (jsonb_typeof("ativos"."estado") = 'object' and octet_length("ativos"."estado"::text) <= 262144)
);
--> statement-breakpoint
-- O modelo é apontado junto com o tipo: a chave única vem antes da referência.
ALTER TABLE "modelos" ADD CONSTRAINT "modelos_id_tipo_unico" UNIQUE("org_id","id","tipo_id");--> statement-breakpoint
ALTER TABLE "organizacoes" ADD COLUMN "modulos_desligados" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "ativos" ADD CONSTRAINT "ativos_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ativos" ADD CONSTRAINT "ativos_tipo_fk" FOREIGN KEY ("org_id","tipo_id") REFERENCES "public"."tipos_de_ativo"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ativos" ADD CONSTRAINT "ativos_modelo_fk" FOREIGN KEY ("org_id","modelo_id","tipo_id") REFERENCES "public"."modelos"("org_id","id","tipo_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ativos" ADD CONSTRAINT "ativos_local_fk" FOREIGN KEY ("org_id","local_id") REFERENCES "public"."locais"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ativos" ADD CONSTRAINT "ativos_responsavel_fk" FOREIGN KEY ("org_id","responsavel_id") REFERENCES "public"."pessoas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ativos_local_idx" ON "ativos" USING btree ("org_id","local_id");--> statement-breakpoint
CREATE INDEX "ativos_tipo_idx" ON "ativos" USING btree ("org_id","tipo_id");--> statement-breakpoint
CREATE INDEX "ativos_situacao_idx" ON "ativos" USING btree ("org_id","situacao","uso");--> statement-breakpoint
-- Isolamento por organização (spec isolamento-organizacoes).
SELECT app.isolar_por_organizacao('ativos');
