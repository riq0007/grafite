CREATE TABLE "agentes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"deviceid" text NOT NULL,
	"nome" text NOT NULL,
	"versao" text,
	"serie" text,
	"sistema" text,
	"ip" text,
	"ativo_id" uuid,
	"ligado_a_mao" boolean DEFAULT false NOT NULL,
	"primeiro_contato" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_contato" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_inventario" timestamp with time zone,
	CONSTRAINT "agentes_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "agentes_deviceid_unico" UNIQUE("org_id","deviceid"),
	CONSTRAINT "agentes_deviceid_valido" CHECK (("agentes"."deviceid" is null or length(trim("agentes"."deviceid")) between 1 and 200)),
	CONSTRAINT "agentes_nome_valido" CHECK (("agentes"."nome" is null or length(trim("agentes"."nome")) between 1 and 200))
);
--> statement-breakpoint
CREATE TABLE "softwares_dos_ativos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"ativo_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"versao" text,
	"editor" text,
	"instalado_em" date,
	"inventariado_em" timestamp with time zone NOT NULL,
	CONSTRAINT "softwares_dos_ativos_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "softwares_dos_ativos_nome_valido" CHECK (("softwares_dos_ativos"."nome" is null or length(trim("softwares_dos_ativos"."nome")) between 1 and 500))
);
--> statement-breakpoint
CREATE TABLE "tokens_dos_agentes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"hash_do_token" text NOT NULL,
	"criado_por" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"revogado_em" timestamp with time zone,
	CONSTRAINT "tokens_dos_agentes_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "tokens_dos_agentes_hash_valido" CHECK (length("tokens_dos_agentes"."hash_do_token") = 64)
);
--> statement-breakpoint
ALTER TABLE "agentes" ADD CONSTRAINT "agentes_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agentes" ADD CONSTRAINT "agentes_ativo_fk" FOREIGN KEY ("org_id","ativo_id") REFERENCES "public"."ativos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "softwares_dos_ativos" ADD CONSTRAINT "softwares_dos_ativos_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "softwares_dos_ativos" ADD CONSTRAINT "softwares_dos_ativos_ativo_fk" FOREIGN KEY ("org_id","ativo_id") REFERENCES "public"."ativos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens_dos_agentes" ADD CONSTRAINT "tokens_dos_agentes_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens_dos_agentes" ADD CONSTRAINT "tokens_dos_agentes_conta_fk" FOREIGN KEY ("org_id","criado_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agentes_ativo_idx" ON "agentes" USING btree ("org_id","ativo_id");--> statement-breakpoint
CREATE INDEX "softwares_dos_ativos_ativo_idx" ON "softwares_dos_ativos" USING btree ("org_id","ativo_id","nome");--> statement-breakpoint
CREATE UNIQUE INDEX "tokens_dos_agentes_um_em_vigor" ON "tokens_dos_agentes" USING btree ("org_id") WHERE "tokens_dos_agentes"."revogado_em" is null;--> statement-breakpoint
SELECT app.isolar_por_organizacao('tokens_dos_agentes');--> statement-breakpoint
SELECT app.isolar_por_organizacao('agentes');--> statement-breakpoint
SELECT app.isolar_por_organizacao('softwares_dos_ativos');