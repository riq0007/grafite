-- Os arquivos das organizações (spec arquivos-e-imagens; design do F2c, decisão 6): o registro de
-- cada arquivo, com o conteúdo no armazenamento, e a foto da pessoa, que a anonimização apaga.
CREATE TABLE "arquivos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"bytes" integer NOT NULL,
	"largura" integer,
	"altura" integer,
	"variantes" text[] DEFAULT '{}'::text[] NOT NULL,
	"enviado_por" uuid,
	"enviado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"removido_em" timestamp with time zone,
	"apagado_em" timestamp with time zone,
	CONSTRAINT "arquivos_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "arquivos_tipo_valido" CHECK (length("arquivos"."tipo") between 1 and 100),
	CONSTRAINT "arquivos_bytes_validos" CHECK ("arquivos"."bytes" >= 0),
	CONSTRAINT "arquivos_dimensoes_validas" CHECK (("arquivos"."largura" is null) = ("arquivos"."altura" is null)
        and ("arquivos"."largura" is null or ("arquivos"."largura" > 0 and "arquivos"."altura" > 0))),
	CONSTRAINT "arquivos_apagado_depois_de_removido" CHECK ("arquivos"."apagado_em" is null or "arquivos"."removido_em" is not null)
);
--> statement-breakpoint
ALTER TABLE "pessoas" DROP CONSTRAINT "pessoas_anonimizada_sem_dados";--> statement-breakpoint
ALTER TABLE "pessoas" ADD COLUMN "foto_id" uuid;--> statement-breakpoint
ALTER TABLE "arquivos" ADD CONSTRAINT "arquivos_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arquivos" ADD CONSTRAINT "arquivos_enviado_por_fk" FOREIGN KEY ("org_id","enviado_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "arquivos_para_apagar_idx" ON "arquivos" USING btree ("org_id","removido_em") WHERE "arquivos"."removido_em" is not null and "arquivos"."apagado_em" is null;--> statement-breakpoint
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_foto_fk" FOREIGN KEY ("org_id","foto_id") REFERENCES "public"."arquivos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_anonimizada_sem_dados" CHECK (("pessoas"."situacao" = 'anonimizada') = ("pessoas"."anonimizada_em" is not null)
        and ("pessoas"."situacao" <> 'anonimizada' or ("pessoas"."email" is null and "pessoas"."matricula" is null
          and "pessoas"."local_id" is null and "pessoas"."telefone" is null and "pessoas"."foto_id" is null)));
--> statement-breakpoint
-- Isolamento por organização (spec isolamento-organizacoes).
SELECT app.isolar_por_organizacao('arquivos');
