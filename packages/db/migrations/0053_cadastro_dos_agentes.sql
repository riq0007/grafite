CREATE TABLE "cadastro_dos_agentes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"tipo_id" uuid,
	"local_id" uuid,
	CONSTRAINT "cadastro_dos_agentes_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "cadastro_dos_agentes_organizacao_unica" UNIQUE("org_id"),
	CONSTRAINT "cadastro_dos_agentes_local_com_tipo" CHECK ("cadastro_dos_agentes"."tipo_id" is not null or "cadastro_dos_agentes"."local_id" is null)
);
--> statement-breakpoint
ALTER TABLE "cadastro_dos_agentes" ADD CONSTRAINT "cadastro_dos_agentes_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cadastro_dos_agentes" ADD CONSTRAINT "cadastro_dos_agentes_tipo_fk" FOREIGN KEY ("org_id","tipo_id") REFERENCES "public"."tipos_de_ativo"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cadastro_dos_agentes" ADD CONSTRAINT "cadastro_dos_agentes_local_fk" FOREIGN KEY ("org_id","local_id") REFERENCES "public"."locais"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
SELECT app.isolar_por_organizacao('cadastro_dos_agentes');
