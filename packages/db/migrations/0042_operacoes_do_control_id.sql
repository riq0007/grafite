CREATE TABLE "operacoes_do_control_id" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"backup_id" uuid NOT NULL,
	"ativo_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"situacao" text NOT NULL,
	"categorias" text[],
	"pedido_por" uuid,
	"pedido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"iniciado_em" timestamp with time zone,
	"concluido_em" timestamp with time zone,
	"coletor_id" uuid,
	"resultado" jsonb,
	"aviso" text,
	"erro" text,
	CONSTRAINT "operacoes_do_control_id_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "operacoes_do_control_id_tipo_valido" CHECK ("operacoes_do_control_id"."tipo" in ('restauracao', 'comparacao')),
	CONSTRAINT "operacoes_do_control_id_situacao_valida" CHECK ("operacoes_do_control_id"."situacao" in ('na-fila', 'em-andamento', 'sucesso', 'parcial', 'falha')),
	CONSTRAINT "operacoes_do_control_id_fim_coerente" CHECK (("operacoes_do_control_id"."situacao" not in ('na-fila', 'em-andamento') or "operacoes_do_control_id"."concluido_em" is null)
        and ("operacoes_do_control_id"."situacao" not in ('sucesso', 'parcial', 'falha') or "operacoes_do_control_id"."concluido_em" is not null)),
	CONSTRAINT "operacoes_do_control_id_textos_validos" CHECK (("operacoes_do_control_id"."erro" is null or length(trim("operacoes_do_control_id"."erro")) between 1 and 2000) and ("operacoes_do_control_id"."aviso" is null or length(trim("operacoes_do_control_id"."aviso")) between 1 and 500))
);
--> statement-breakpoint
ALTER TABLE "operacoes_do_control_id" ADD CONSTRAINT "operacoes_do_control_id_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacoes_do_control_id" ADD CONSTRAINT "operacoes_do_control_id_backup_fk" FOREIGN KEY ("org_id","backup_id") REFERENCES "public"."backups_do_control_id"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacoes_do_control_id" ADD CONSTRAINT "operacoes_do_control_id_ativo_fk" FOREIGN KEY ("org_id","ativo_id") REFERENCES "public"."ativos"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacoes_do_control_id" ADD CONSTRAINT "operacoes_do_control_id_pedido_por_fk" FOREIGN KEY ("org_id","pedido_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacoes_do_control_id" ADD CONSTRAINT "operacoes_do_control_id_coletor_fk" FOREIGN KEY ("org_id","coletor_id") REFERENCES "public"."coletores"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "operacoes_do_control_id_aberta_unica" ON "operacoes_do_control_id" USING btree ("org_id","ativo_id") WHERE "operacoes_do_control_id"."situacao" in ('na-fila', 'em-andamento');--> statement-breakpoint
CREATE INDEX "operacoes_do_control_id_ativo_idx" ON "operacoes_do_control_id" USING btree ("org_id","ativo_id","pedido_em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "operacoes_do_control_id_backup_idx" ON "operacoes_do_control_id" USING btree ("org_id","backup_id");--> statement-breakpoint
SELECT app.isolar_por_organizacao('operacoes_do_control_id');