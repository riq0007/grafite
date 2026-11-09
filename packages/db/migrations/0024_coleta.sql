-- A coleta (design do P2a, decisões 3 e 10): os coletores da organização, com o hash do token e as
-- faixas de rede; as chaves dos lotes recebidos, que não deixam o reenvio duplicar; as leituras em
-- série temporal; o estado atual de cada ativo e métrica; e a configuração das capacidades no tipo.
CREATE TABLE "coletores" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"nome_normalizado" text NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"faixas" text[] DEFAULT '{}'::text[] NOT NULL,
	"situacao" text DEFAULT 'ativo' NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_contato_em" timestamp with time zone,
	"versao" text,
	CONSTRAINT "coletores_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "coletores_nome_unico" UNIQUE("org_id","nome_normalizado"),
	CONSTRAINT "coletores_token_unico" UNIQUE("org_id","token_hash"),
	CONSTRAINT "coletores_situacao_valida" CHECK ("coletores"."situacao" in ('ativo', 'inativo')),
	CONSTRAINT "coletores_nome_valido" CHECK (length(trim("coletores"."nome")) between 1 and 60),
	CONSTRAINT "coletores_faixas_validas" CHECK (cardinality("coletores"."faixas") <= 50),
	CONSTRAINT "coletores_versao_valida" CHECK ("coletores"."versao" is null or length("coletores"."versao") between 1 and 40)
);
--> statement-breakpoint
CREATE TABLE "estado_dos_ativos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"ativo_id" uuid NOT NULL,
	"metrica" text NOT NULL,
	"momento" timestamp with time zone NOT NULL,
	"valor_numero" double precision,
	"valor_texto" text,
	"situacao" text NOT NULL,
	"desde" timestamp with time zone NOT NULL,
	"coletor_id" uuid NOT NULL,
	CONSTRAINT "estado_dos_ativos_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "estado_dos_ativos_metrica_unica" UNIQUE("org_id","ativo_id","metrica"),
	CONSTRAINT "estado_dos_ativos_situacao_valida" CHECK ("estado_dos_ativos"."situacao" in ('valida', 'sem-dado', 'inconsistente')),
	CONSTRAINT "estado_dos_ativos_sem_dado_sem_valor" CHECK ("estado_dos_ativos"."situacao" <> 'sem-dado' or ("estado_dos_ativos"."valor_numero" is null and "estado_dos_ativos"."valor_texto" is null)),
	CONSTRAINT "estado_dos_ativos_metrica_valida" CHECK (length("estado_dos_ativos"."metrica") between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "leituras" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"ativo_id" uuid NOT NULL,
	"metrica" text NOT NULL,
	"momento" timestamp with time zone NOT NULL,
	"valor_numero" double precision,
	"valor_texto" text,
	"situacao" text NOT NULL,
	"coletor_id" uuid NOT NULL,
	CONSTRAINT "leituras_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "leituras_situacao_valida" CHECK ("leituras"."situacao" in ('valida', 'sem-dado', 'inconsistente')),
	CONSTRAINT "leituras_sem_dado_sem_valor" CHECK ("leituras"."situacao" <> 'sem-dado' or ("leituras"."valor_numero" is null and "leituras"."valor_texto" is null)),
	CONSTRAINT "leituras_metrica_valida" CHECK (length("leituras"."metrica") between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "lotes_da_coleta" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"coletor_id" uuid NOT NULL,
	"chave" uuid NOT NULL,
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"gravadas" integer NOT NULL,
	"ignoradas" integer NOT NULL,
	CONSTRAINT "lotes_da_coleta_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "lotes_da_coleta_chave_unica" UNIQUE("org_id","chave"),
	CONSTRAINT "lotes_da_coleta_contagens_validas" CHECK ("lotes_da_coleta"."gravadas" >= 0 and "lotes_da_coleta"."ignoradas" >= 0
        and "lotes_da_coleta"."gravadas" + "lotes_da_coleta"."ignoradas" between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "tipos_de_ativo" ADD COLUMN "configuracao_das_capacidades" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "coletores" ADD CONSTRAINT "coletores_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coletores" ADD CONSTRAINT "coletores_criado_por_fk" FOREIGN KEY ("org_id","criado_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estado_dos_ativos" ADD CONSTRAINT "estado_dos_ativos_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estado_dos_ativos" ADD CONSTRAINT "estado_dos_ativos_ativo_fk" FOREIGN KEY ("org_id","ativo_id") REFERENCES "public"."ativos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estado_dos_ativos" ADD CONSTRAINT "estado_dos_ativos_coletor_fk" FOREIGN KEY ("org_id","coletor_id") REFERENCES "public"."coletores"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leituras" ADD CONSTRAINT "leituras_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leituras" ADD CONSTRAINT "leituras_ativo_fk" FOREIGN KEY ("org_id","ativo_id") REFERENCES "public"."ativos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leituras" ADD CONSTRAINT "leituras_coletor_fk" FOREIGN KEY ("org_id","coletor_id") REFERENCES "public"."coletores"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes_da_coleta" ADD CONSTRAINT "lotes_da_coleta_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes_da_coleta" ADD CONSTRAINT "lotes_da_coleta_coletor_fk" FOREIGN KEY ("org_id","coletor_id") REFERENCES "public"."coletores"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leituras_do_ativo_idx" ON "leituras" USING btree ("org_id","ativo_id","metrica","momento" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "leituras_momento_idx" ON "leituras" USING brin ("momento");--> statement-breakpoint
CREATE INDEX "lotes_da_coleta_recebido_idx" ON "lotes_da_coleta" USING btree ("org_id","recebido_em");--> statement-breakpoint
ALTER TABLE "tipos_de_ativo" ADD CONSTRAINT "tipos_de_ativo_configuracao_das_capacidades_valida" CHECK (jsonb_typeof("tipos_de_ativo"."configuracao_das_capacidades") = 'object');--> statement-breakpoint
-- Isolamento por organização (spec isolamento-organizacoes).
SELECT app.isolar_por_organizacao('coletores');--> statement-breakpoint
SELECT app.isolar_por_organizacao('lotes_da_coleta');--> statement-breakpoint
SELECT app.isolar_por_organizacao('leituras');--> statement-breakpoint
SELECT app.isolar_por_organizacao('estado_dos_ativos');
