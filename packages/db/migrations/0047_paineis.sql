CREATE TABLE "paineis" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"nome_normalizado" text NOT NULL,
	"endereco" text NOT NULL,
	"local_id" uuid,
	"ordem" integer DEFAULT 100 NOT NULL,
	"situacao" text DEFAULT 'ativo' NOT NULL,
	"verificacao" text DEFAULT 'sem-verificacao' NOT NULL,
	"verificado_em" timestamp with time zone,
	"tempo_da_resposta" integer,
	"motivo" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paineis_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "paineis_nome_unico" UNIQUE("org_id","nome_normalizado"),
	CONSTRAINT "paineis_nome_valido" CHECK (length(trim("paineis"."nome")) between 1 and 80),
	CONSTRAINT "paineis_endereco_valido" CHECK ("paineis"."endereco" ~ '^https?://' and length("paineis"."endereco") <= 500),
	CONSTRAINT "paineis_ordem_valida" CHECK ("paineis"."ordem" between 1 and 999),
	CONSTRAINT "paineis_verificacao_valida" CHECK ("paineis"."verificacao" in ('sem-verificacao', 'no-ar', 'fora-do-ar')),
	CONSTRAINT "paineis_motivo_valido" CHECK (("paineis"."motivo" is null or length(trim("paineis"."motivo")) between 1 and 200))
);
--> statement-breakpoint
ALTER TABLE "paineis" ADD CONSTRAINT "paineis_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paineis" ADD CONSTRAINT "paineis_local_fk" FOREIGN KEY ("org_id","local_id") REFERENCES "public"."locais"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
SELECT app.isolar_por_organizacao('paineis');
