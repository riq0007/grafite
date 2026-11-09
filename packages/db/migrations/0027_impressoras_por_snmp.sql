-- As impressoras por SNMP (change p2b-impressoras-por-snmp, design, decisão 2): o item e os detalhes
-- nas leituras e no estado atual, que passa a ter a chave por ativo, métrica e item, os agregados
-- por hora, isolados pela organização, e o tipo de segredo Comunidade SNMP. As leituras e o estado
-- do ping ficam com o item vazio, sem migrar nada.
CREATE TABLE "leituras_por_hora" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"ativo_id" uuid NOT NULL,
	"metrica" text NOT NULL,
	"item" text DEFAULT '' NOT NULL,
	"hora" timestamp with time zone NOT NULL,
	"leituras" integer NOT NULL,
	"validas" integer NOT NULL,
	"minimo" double precision,
	"maximo" double precision,
	"media" double precision,
	"ultimo" double precision,
	"ultimo_momento" timestamp with time zone,
	CONSTRAINT "leituras_por_hora_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "leituras_por_hora_unicas" UNIQUE("org_id","ativo_id","metrica","item","hora"),
	CONSTRAINT "leituras_por_hora_metrica_valida" CHECK (length("leituras_por_hora"."metrica") between 1 and 60),
	CONSTRAINT "leituras_por_hora_item_valido" CHECK (length("leituras_por_hora"."item") <= 20),
	CONSTRAINT "leituras_por_hora_hora_cheia" CHECK ("leituras_por_hora"."hora" = date_trunc('hour', "leituras_por_hora"."hora", 'UTC')),
	CONSTRAINT "leituras_por_hora_contagens_validas" CHECK ("leituras_por_hora"."leituras" >= 1 and "leituras_por_hora"."validas" between 0 and "leituras_por_hora"."leituras"),
	CONSTRAINT "leituras_por_hora_sem_valida_sem_valor" CHECK ("leituras_por_hora"."validas" > 0 or ("leituras_por_hora"."minimo" is null and "leituras_por_hora"."maximo" is null and "leituras_por_hora"."media" is null
        and "leituras_por_hora"."ultimo" is null and "leituras_por_hora"."ultimo_momento" is null))
);
--> statement-breakpoint
ALTER TABLE "estado_dos_ativos" DROP CONSTRAINT "estado_dos_ativos_metrica_unica";--> statement-breakpoint
ALTER TABLE "segredos" DROP CONSTRAINT "segredos_tipo_valido";--> statement-breakpoint
DROP INDEX "leituras_do_ativo_idx";--> statement-breakpoint
ALTER TABLE "estado_dos_ativos" ADD COLUMN "item" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "estado_dos_ativos" ADD COLUMN "detalhes" jsonb;--> statement-breakpoint
ALTER TABLE "leituras" ADD COLUMN "item" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "leituras" ADD COLUMN "detalhes" jsonb;--> statement-breakpoint
ALTER TABLE "leituras_por_hora" ADD CONSTRAINT "leituras_por_hora_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leituras_por_hora" ADD CONSTRAINT "leituras_por_hora_ativo_fk" FOREIGN KEY ("org_id","ativo_id") REFERENCES "public"."ativos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leituras_por_hora_hora_idx" ON "leituras_por_hora" USING brin ("hora");--> statement-breakpoint
CREATE INDEX "leituras_do_ativo_idx" ON "leituras" USING btree ("org_id","ativo_id","metrica","item","momento" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "estado_dos_ativos" ADD CONSTRAINT "estado_dos_ativos_item_unico" UNIQUE("org_id","ativo_id","metrica","item");--> statement-breakpoint
ALTER TABLE "estado_dos_ativos" ADD CONSTRAINT "estado_dos_ativos_item_valido" CHECK (length("estado_dos_ativos"."item") <= 20);--> statement-breakpoint
ALTER TABLE "estado_dos_ativos" ADD CONSTRAINT "estado_dos_ativos_detalhes_validos" CHECK ("estado_dos_ativos"."detalhes" is null or (jsonb_typeof("estado_dos_ativos"."detalhes") = 'object'
        and octet_length("estado_dos_ativos"."detalhes"::text) <= 2048));--> statement-breakpoint
ALTER TABLE "leituras" ADD CONSTRAINT "leituras_item_valido" CHECK (length("leituras"."item") <= 20);--> statement-breakpoint
ALTER TABLE "leituras" ADD CONSTRAINT "leituras_detalhes_validos" CHECK ("leituras"."detalhes" is null or (jsonb_typeof("leituras"."detalhes") = 'object'
        and octet_length("leituras"."detalhes"::text) <= 2048));--> statement-breakpoint
ALTER TABLE "segredos" ADD CONSTRAINT "segredos_tipo_valido" CHECK ("segredos"."tipo" in ('usuario-e-senha', 'conta-administrativa', 'banco-de-dados', 'conta-de-servico', 'chave-de-api', 'token', 'chave-ssh', 'certificado', 'pin', 'wi-fi', 'chave-de-licenca', 'comunidade-snmp', 'outro'));
--> statement-breakpoint
SELECT app.isolar_por_organizacao('leituras_por_hora');
