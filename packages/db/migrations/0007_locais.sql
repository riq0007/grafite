CREATE TABLE "locais" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"pai_id" uuid,
	"nome" text NOT NULL,
	"nome_normalizado" text NOT NULL,
	"tipo" text NOT NULL,
	"situacao" text DEFAULT 'ativo' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locais_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "locais_nome_unico_no_lugar" UNIQUE NULLS NOT DISTINCT("org_id","pai_id","nome_normalizado"),
	CONSTRAINT "locais_nome_valido" CHECK (length(trim("locais"."nome")) between 1 and 80),
	CONSTRAINT "locais_tipo_valido" CHECK ("locais"."tipo" in ('unidade', 'predio', 'andar', 'setor', 'sala', 'outro')),
	CONSTRAINT "locais_situacao_valida" CHECK ("locais"."situacao" in ('ativo', 'inativo'))
);
--> statement-breakpoint
ALTER TABLE "locais" ADD CONSTRAINT "locais_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locais" ADD CONSTRAINT "locais_pai_fk" FOREIGN KEY ("org_id","pai_id") REFERENCES "public"."locais"("org_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Isolamento por organização (spec isolamento-organizacoes).
SELECT app.isolar_por_organizacao('locais');
