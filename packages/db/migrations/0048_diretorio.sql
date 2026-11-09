CREATE TABLE "diretorios" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"servidor" text NOT NULL,
	"base_dn" text NOT NULL,
	"segredo_id" uuid NOT NULL,
	"atributo_do_usuario" text NOT NULL,
	"filtro_das_pessoas" text NOT NULL,
	"conferir_certificado" boolean DEFAULT true NOT NULL,
	"ligado" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diretorios_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "diretorios_um_por_organizacao" UNIQUE("org_id"),
	CONSTRAINT "diretorios_servidor_valido" CHECK ("diretorios"."servidor" ~* '^ldaps?://' and length("diretorios"."servidor") <= 300),
	CONSTRAINT "diretorios_base_valida" CHECK (("diretorios"."base_dn" is null or length(trim("diretorios"."base_dn")) between 1 and 500)),
	CONSTRAINT "diretorios_atributo_valido" CHECK (("diretorios"."atributo_do_usuario" is null or length(trim("diretorios"."atributo_do_usuario")) between 1 and 64)),
	CONSTRAINT "diretorios_filtro_valido" CHECK (("diretorios"."filtro_das_pessoas" is null or length(trim("diretorios"."filtro_das_pessoas")) between 1 and 1000))
);
--> statement-breakpoint
CREATE TABLE "mapeamentos_do_diretorio" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"grupo_dn" text NOT NULL,
	"grupo_dn_normalizado" text NOT NULL,
	"grupo_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mapeamentos_do_diretorio_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "mapeamentos_do_diretorio_grupo_unico" UNIQUE("org_id","grupo_dn_normalizado"),
	CONSTRAINT "mapeamentos_do_diretorio_dn_valido" CHECK (("mapeamentos_do_diretorio"."grupo_dn" is null or length(trim("mapeamentos_do_diretorio"."grupo_dn")) between 1 and 1000))
);
--> statement-breakpoint
ALTER TABLE "contas" ADD COLUMN "origem" text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "diretorios" ADD CONSTRAINT "diretorios_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diretorios" ADD CONSTRAINT "diretorios_segredo_fk" FOREIGN KEY ("org_id","segredo_id") REFERENCES "public"."segredos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapeamentos_do_diretorio" ADD CONSTRAINT "mapeamentos_do_diretorio_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapeamentos_do_diretorio" ADD CONSTRAINT "mapeamentos_do_diretorio_grupo_fk" FOREIGN KEY ("org_id","grupo_id") REFERENCES "public"."grupos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mapeamentos_do_diretorio_grupo_idx" ON "mapeamentos_do_diretorio" USING btree ("org_id","grupo_id");--> statement-breakpoint
ALTER TABLE "contas" ADD CONSTRAINT "contas_origem_valida" CHECK ("contas"."origem" in ('local', 'diretorio'));--> statement-breakpoint
SELECT app.isolar_por_organizacao('diretorios');--> statement-breakpoint
SELECT app.isolar_por_organizacao('mapeamentos_do_diretorio');