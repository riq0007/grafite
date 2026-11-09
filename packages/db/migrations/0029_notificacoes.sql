-- As notificações (change p3b-notificacoes-no-servidor, design, decisão 2): uma linha por conta, com
-- o alerta de que trata e a leitura; os índices da lista da conta, das não lidas e da retenção.
CREATE TABLE "notificacoes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"severidade" text NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text,
	"origem" text NOT NULL,
	"destino" text,
	"alerta_id" uuid,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"lida_em" timestamp with time zone,
	CONSTRAINT "notificacoes_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "notificacoes_severidade_valida" CHECK ("notificacoes"."severidade" in ('critico', 'atencao', 'info')),
	CONSTRAINT "notificacoes_titulo_valido" CHECK (length("notificacoes"."titulo") between 1 and 200),
	CONSTRAINT "notificacoes_descricao_valida" CHECK ("notificacoes"."descricao" is null or length("notificacoes"."descricao") between 1 and 300),
	CONSTRAINT "notificacoes_origem_valida" CHECK (length("notificacoes"."origem") between 1 and 40),
	CONSTRAINT "notificacoes_destino_valido" CHECK ("notificacoes"."destino" is null or ("notificacoes"."destino" like '/%' and length("notificacoes"."destino") <= 500))
);
--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_conta_fk" FOREIGN KEY ("org_id","conta_id") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_alerta_fk" FOREIGN KEY ("org_id","alerta_id") REFERENCES "public"."alertas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notificacoes_da_conta_idx" ON "notificacoes" USING btree ("org_id","conta_id","criada_em" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notificacoes_nao_lidas_idx" ON "notificacoes" USING btree ("org_id","conta_id") WHERE "notificacoes"."lida_em" is null;--> statement-breakpoint
CREATE INDEX "notificacoes_antigas_idx" ON "notificacoes" USING btree ("org_id","criada_em");--> statement-breakpoint
SELECT app.isolar_por_organizacao('notificacoes');
