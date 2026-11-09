CREATE TABLE "atribuicoes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"perfil_id" uuid NOT NULL,
	"conta_id" uuid,
	"grupo_id" uuid,
	"local_id" uuid,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"encerrada_em" timestamp with time zone,
	CONSTRAINT "atribuicoes_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "atribuicoes_conta_ou_grupo" CHECK (("atribuicoes"."conta_id" is null) <> ("atribuicoes"."grupo_id" is null))
);
--> statement-breakpoint
CREATE TABLE "grupos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"nome_normalizado" text NOT NULL,
	"descricao" text,
	"situacao" text DEFAULT 'ativo' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grupos_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "grupos_nome_unico" UNIQUE("org_id","nome_normalizado"),
	CONSTRAINT "grupos_nome_valido" CHECK (length(trim("grupos"."nome")) between 1 and 80),
	CONSTRAINT "grupos_descricao_curta" CHECK (length("grupos"."descricao") <= 500),
	CONSTRAINT "grupos_situacao_valida" CHECK ("grupos"."situacao" in ('ativo', 'inativo'))
);
--> statement-breakpoint
CREATE TABLE "membros_do_grupo" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"grupo_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"incluida_em" timestamp with time zone DEFAULT now() NOT NULL,
	"encerrada_em" timestamp with time zone,
	CONSTRAINT "membros_do_grupo_org_id_id_unico" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "perfis" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"nome_normalizado" text NOT NULL,
	"descricao" text,
	"permissoes" text[] DEFAULT '{}'::text[] NOT NULL,
	"todas_as_permissoes" boolean DEFAULT false NOT NULL,
	"protegido" boolean DEFAULT false NOT NULL,
	"exige_dois_passos" boolean DEFAULT false NOT NULL,
	"situacao" text DEFAULT 'ativo' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perfis_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "perfis_nome_unico" UNIQUE("org_id","nome_normalizado"),
	CONSTRAINT "perfis_nome_valido" CHECK (length(trim("perfis"."nome")) between 1 and 80),
	CONSTRAINT "perfis_descricao_curta" CHECK (length("perfis"."descricao") <= 500),
	CONSTRAINT "perfis_situacao_valida" CHECK ("perfis"."situacao" in ('ativo', 'inativo')),
	CONSTRAINT "perfis_todas_so_no_protegido" CHECK (not "perfis"."todas_as_permissoes" or "perfis"."protegido")
);
--> statement-breakpoint
ALTER TABLE "atribuicoes" ADD CONSTRAINT "atribuicoes_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atribuicoes" ADD CONSTRAINT "atribuicoes_perfil_fk" FOREIGN KEY ("org_id","perfil_id") REFERENCES "public"."perfis"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atribuicoes" ADD CONSTRAINT "atribuicoes_conta_fk" FOREIGN KEY ("org_id","conta_id") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atribuicoes" ADD CONSTRAINT "atribuicoes_grupo_fk" FOREIGN KEY ("org_id","grupo_id") REFERENCES "public"."grupos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atribuicoes" ADD CONSTRAINT "atribuicoes_local_fk" FOREIGN KEY ("org_id","local_id") REFERENCES "public"."locais"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupos" ADD CONSTRAINT "grupos_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membros_do_grupo" ADD CONSTRAINT "membros_do_grupo_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membros_do_grupo" ADD CONSTRAINT "membros_do_grupo_grupo_fk" FOREIGN KEY ("org_id","grupo_id") REFERENCES "public"."grupos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membros_do_grupo" ADD CONSTRAINT "membros_do_grupo_conta_fk" FOREIGN KEY ("org_id","conta_id") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfis" ADD CONSTRAINT "perfis_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "atribuicoes_conta_idx" ON "atribuicoes" USING btree ("org_id","conta_id");--> statement-breakpoint
CREATE INDEX "atribuicoes_grupo_idx" ON "atribuicoes" USING btree ("org_id","grupo_id");--> statement-breakpoint
CREATE INDEX "atribuicoes_perfil_idx" ON "atribuicoes" USING btree ("org_id","perfil_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membros_do_grupo_em_vigor" ON "membros_do_grupo" USING btree ("org_id","grupo_id","conta_id") WHERE "membros_do_grupo"."encerrada_em" is null;--> statement-breakpoint
CREATE INDEX "membros_do_grupo_conta_idx" ON "membros_do_grupo" USING btree ("org_id","conta_id");
--> statement-breakpoint
-- Uma atribuição em vigor por perfil, conta ou grupo e escopo (spec perfis-e-grupos). O Drizzle
-- ainda não declara nulls not distinct em índices, e a conta, o grupo e o local podem ser nulos.
CREATE UNIQUE INDEX "atribuicoes_em_vigor" ON "atribuicoes" ("org_id","perfil_id","conta_id","grupo_id","local_id") NULLS NOT DISTINCT WHERE "encerrada_em" IS NULL;
--> statement-breakpoint
-- Isolamento por organização (spec isolamento-organizacoes).
SELECT app.isolar_por_organizacao('perfis');
--> statement-breakpoint
SELECT app.isolar_por_organizacao('grupos');
--> statement-breakpoint
SELECT app.isolar_por_organizacao('membros_do_grupo');
--> statement-breakpoint
SELECT app.isolar_por_organizacao('atribuicoes');
