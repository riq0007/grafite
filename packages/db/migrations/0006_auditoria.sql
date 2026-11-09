CREATE TABLE "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"momento" timestamp with time zone DEFAULT now() NOT NULL,
	"acao" text NOT NULL,
	"ator_tipo" text NOT NULL,
	"ator_conta_id" uuid,
	"ator_descricao" text,
	"alvo_tipo" text NOT NULL,
	"alvo_id" uuid,
	"antes" jsonb,
	"depois" jsonb,
	"dados" jsonb,
	"ip" "inet",
	"codigo_de_rastreio" text,
	CONSTRAINT "auditoria_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "auditoria_ator_valido" CHECK (("auditoria"."ator_tipo" = 'conta' and "auditoria"."ator_conta_id" is not null and "auditoria"."ator_descricao" is null)
        or ("auditoria"."ator_tipo" = 'sistema' and "auditoria"."ator_conta_id" is null and "auditoria"."ator_descricao" is not null)
        or ("auditoria"."ator_tipo" = 'anonimo' and "auditoria"."ator_conta_id" is null and "auditoria"."ator_descricao" is null)),
	CONSTRAINT "auditoria_acao_valida" CHECK ("auditoria"."acao" ~ '^[a-z-]+[.][a-z-]+$'),
	CONSTRAINT "auditoria_alvo_valido" CHECK ("auditoria"."alvo_tipo" ~ '^[a-z-]+$')
);
--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_ator_conta_fk" FOREIGN KEY ("org_id","ator_conta_id") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_momento_idx" ON "auditoria" USING btree ("org_id","momento" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "auditoria_alvo_idx" ON "auditoria" USING btree ("org_id","alvo_tipo","alvo_id","momento" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "auditoria_ator_idx" ON "auditoria" USING btree ("org_id","ator_conta_id","momento" DESC NULLS LAST);
--> statement-breakpoint
-- Isolamento por organização (spec isolamento-organizacoes).
SELECT app.isolar_por_organizacao('auditoria');
--> statement-breakpoint
-- Só inclusão (spec auditoria): o papel da aplicação inclui e lê, e nunca altera nem apaga.
REVOKE UPDATE, DELETE ON auditoria FROM grafite_app;
