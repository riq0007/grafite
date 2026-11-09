CREATE TABLE "backups_do_control_id" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"ativo_id" uuid NOT NULL,
	"origem" text NOT NULL,
	"situacao" text NOT NULL,
	"pedido_por" uuid,
	"pedido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"iniciado_em" timestamp with time zone,
	"concluido_em" timestamp with time zone,
	"coletor_id" uuid,
	"arquivo" text,
	"tamanho" bigint,
	"registros" integer,
	"fotos" integer,
	"serie" text,
	"firmware" text,
	"modelo" text,
	"categorias" jsonb,
	"erro" text,
	CONSTRAINT "backups_do_control_id_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "backups_do_control_id_situacao_valida" CHECK ("backups_do_control_id"."situacao" in ('na-fila', 'em-andamento', 'sucesso', 'parcial', 'falha')),
	CONSTRAINT "backups_do_control_id_origem_valida" CHECK ("backups_do_control_id"."origem" in ('manual', 'agendado')),
	CONSTRAINT "backups_do_control_id_fim_coerente" CHECK (("backups_do_control_id"."situacao" not in ('na-fila', 'em-andamento') or "backups_do_control_id"."concluido_em" is null)
        and ("backups_do_control_id"."situacao" not in ('sucesso', 'parcial', 'falha') or "backups_do_control_id"."concluido_em" is not null)
        and ("backups_do_control_id"."arquivo" is null or "backups_do_control_id"."situacao" in ('sucesso', 'parcial'))),
	CONSTRAINT "backups_do_control_id_textos_validos" CHECK (("backups_do_control_id"."erro" is null or length(trim("backups_do_control_id"."erro")) between 1 and 2000) and ("backups_do_control_id"."serie" is null or length(trim("backups_do_control_id"."serie")) between 1 and 100)
        and ("backups_do_control_id"."firmware" is null or length(trim("backups_do_control_id"."firmware")) between 1 and 100) and ("backups_do_control_id"."modelo" is null or length(trim("backups_do_control_id"."modelo")) between 1 and 100))
);
--> statement-breakpoint
ALTER TABLE "backups_do_control_id" ADD CONSTRAINT "backups_do_control_id_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backups_do_control_id" ADD CONSTRAINT "backups_do_control_id_ativo_fk" FOREIGN KEY ("org_id","ativo_id") REFERENCES "public"."ativos"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backups_do_control_id" ADD CONSTRAINT "backups_do_control_id_pedido_por_fk" FOREIGN KEY ("org_id","pedido_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backups_do_control_id" ADD CONSTRAINT "backups_do_control_id_coletor_fk" FOREIGN KEY ("org_id","coletor_id") REFERENCES "public"."coletores"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "backups_do_control_id_aberto_unico" ON "backups_do_control_id" USING btree ("org_id","ativo_id") WHERE "backups_do_control_id"."situacao" in ('na-fila', 'em-andamento');--> statement-breakpoint
CREATE INDEX "backups_do_control_id_ativo_idx" ON "backups_do_control_id" USING btree ("org_id","ativo_id","pedido_em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "backups_do_control_id_pedido_idx" ON "backups_do_control_id" USING btree ("org_id","pedido_em" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
SELECT app.isolar_por_organizacao('backups_do_control_id');