CREATE TABLE "contas" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"usuario" text NOT NULL,
	"hash_senha" text NOT NULL,
	"senha_temporaria" boolean DEFAULT true NOT NULL,
	"exige_dois_passos" boolean DEFAULT false NOT NULL,
	"situacao" text DEFAULT 'ativa' NOT NULL,
	"senha_trocada_em" timestamp with time zone,
	"ultima_entrada_em" timestamp with time zone,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contas_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "contas_pessoa_unica" UNIQUE("pessoa_id"),
	CONSTRAINT "contas_usuario_unico" UNIQUE("org_id","usuario"),
	CONSTRAINT "contas_usuario_normalizado" CHECK ("contas"."usuario" ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
	CONSTRAINT "contas_situacao_valida" CHECK ("contas"."situacao" in ('ativa', 'inativa'))
);
--> statement-breakpoint
CREATE TABLE "pessoas" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"email" text,
	"situacao" text DEFAULT 'ativa' NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pessoas_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "pessoas_nome_preenchido" CHECK (length(trim("pessoas"."nome")) > 0),
	CONSTRAINT "pessoas_situacao_valida" CHECK ("pessoas"."situacao" in ('ativa', 'inativa'))
);
--> statement-breakpoint
ALTER TABLE "contas" ADD CONSTRAINT "contas_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas" ADD CONSTRAINT "contas_pessoa_fk" FOREIGN KEY ("org_id","pessoa_id") REFERENCES "public"."pessoas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Isolamento por organização (spec isolamento-organizacoes).
SELECT app.isolar_por_organizacao('pessoas');
--> statement-breakpoint
SELECT app.isolar_por_organizacao('contas');
