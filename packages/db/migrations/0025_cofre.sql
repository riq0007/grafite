-- O cofre (design do P6, decisões 1 a 6): os segredos, com o conteúdo cifrado pela chave própria e
-- essa chave cifrada pela chave mestra do servidor; os acessos de cada segredo, um titular por linha
-- (a conta, o grupo ou o perfil); os ativos em que cada segredo é usado; e, na sessão, até quando o
-- código do app liberou revelar e copiar.
CREATE TABLE "acessos_aos_segredos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"segredo_id" uuid NOT NULL,
	"conta_id" uuid,
	"grupo_id" uuid,
	"perfil_id" uuid,
	"concedido_por" uuid,
	"concedido_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acessos_aos_segredos_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "acessos_aos_segredos_titular_unico" UNIQUE NULLS NOT DISTINCT("org_id","segredo_id","conta_id","grupo_id","perfil_id"),
	CONSTRAINT "acessos_aos_segredos_um_titular" CHECK (num_nonnulls("acessos_aos_segredos"."conta_id", "acessos_aos_segredos"."grupo_id", "acessos_aos_segredos"."perfil_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "segredos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"nome_normalizado" text NOT NULL,
	"tipo" text NOT NULL,
	"classificacao" text NOT NULL,
	"identificador" text,
	"endereco" text,
	"notas" text,
	"validade" date,
	"proxima_rotacao" date,
	"pessoa_id" uuid,
	"situacao" text DEFAULT 'ativo' NOT NULL,
	"conteudo_cifrado" "bytea" NOT NULL,
	"chave_cifrada" "bytea" NOT NULL,
	"impressao_da_chave_mestra" text NOT NULL,
	"criado_por" uuid,
	"valor_trocado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "segredos_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "segredos_nome_valido" CHECK (length(trim("segredos"."nome")) between 1 and 120),
	CONSTRAINT "segredos_tipo_valido" CHECK ("segredos"."tipo" in ('usuario-e-senha', 'conta-administrativa', 'banco-de-dados', 'conta-de-servico', 'chave-de-api', 'token', 'chave-ssh', 'certificado', 'pin', 'wi-fi', 'chave-de-licenca', 'outro')),
	CONSTRAINT "segredos_classificacao_valida" CHECK ("segredos"."classificacao" in ('pessoal', 'compartilhado', 'administrativo', 'privilegiado', 'aplicacao', 'equipamento')),
	CONSTRAINT "segredos_situacao_valida" CHECK ("segredos"."situacao" in ('ativo', 'inativo')),
	CONSTRAINT "segredos_identificador_valido" CHECK ("segredos"."identificador" is null or length("segredos"."identificador") between 1 and 200),
	CONSTRAINT "segredos_endereco_valido" CHECK ("segredos"."endereco" is null or length("segredos"."endereco") between 1 and 500),
	CONSTRAINT "segredos_notas_validas" CHECK ("segredos"."notas" is null or length("segredos"."notas") between 1 and 2000),
	CONSTRAINT "segredos_impressao_valida" CHECK ("segredos"."impressao_da_chave_mestra" ~ '^[0-9a-f]{16}$')
);
--> statement-breakpoint
CREATE TABLE "segredos_dos_ativos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"segredo_id" uuid NOT NULL,
	"ativo_id" uuid NOT NULL,
	CONSTRAINT "segredos_dos_ativos_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "segredos_dos_ativos_unico" UNIQUE("org_id","segredo_id","ativo_id")
);
--> statement-breakpoint
ALTER TABLE "sessoes" ADD COLUMN "cofre_liberado_ate" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "acessos_aos_segredos" ADD CONSTRAINT "acessos_aos_segredos_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acessos_aos_segredos" ADD CONSTRAINT "acessos_aos_segredos_segredo_fk" FOREIGN KEY ("org_id","segredo_id") REFERENCES "public"."segredos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acessos_aos_segredos" ADD CONSTRAINT "acessos_aos_segredos_conta_fk" FOREIGN KEY ("org_id","conta_id") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acessos_aos_segredos" ADD CONSTRAINT "acessos_aos_segredos_grupo_fk" FOREIGN KEY ("org_id","grupo_id") REFERENCES "public"."grupos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acessos_aos_segredos" ADD CONSTRAINT "acessos_aos_segredos_perfil_fk" FOREIGN KEY ("org_id","perfil_id") REFERENCES "public"."perfis"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acessos_aos_segredos" ADD CONSTRAINT "acessos_aos_segredos_concedido_por_fk" FOREIGN KEY ("org_id","concedido_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segredos" ADD CONSTRAINT "segredos_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segredos" ADD CONSTRAINT "segredos_pessoa_fk" FOREIGN KEY ("org_id","pessoa_id") REFERENCES "public"."pessoas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segredos" ADD CONSTRAINT "segredos_criado_por_fk" FOREIGN KEY ("org_id","criado_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segredos_dos_ativos" ADD CONSTRAINT "segredos_dos_ativos_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segredos_dos_ativos" ADD CONSTRAINT "segredos_dos_ativos_segredo_fk" FOREIGN KEY ("org_id","segredo_id") REFERENCES "public"."segredos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segredos_dos_ativos" ADD CONSTRAINT "segredos_dos_ativos_ativo_fk" FOREIGN KEY ("org_id","ativo_id") REFERENCES "public"."ativos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "segredos_nome_idx" ON "segredos" USING btree ("org_id","nome_normalizado");--> statement-breakpoint
CREATE INDEX "segredos_dos_ativos_ativo_idx" ON "segredos_dos_ativos" USING btree ("org_id","ativo_id");--> statement-breakpoint
SELECT app.isolar_por_organizacao('segredos');--> statement-breakpoint
SELECT app.isolar_por_organizacao('acessos_aos_segredos');--> statement-breakpoint
SELECT app.isolar_por_organizacao('segredos_dos_ativos');
