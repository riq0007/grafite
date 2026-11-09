-- Os aparelhos do push e as marcas do envio das notificações (change p3c-email-e-push, design,
-- decisões 3 e 8): a inscrição de cada aparelho da conta, isolada pela organização, e o momento em
-- que cada notificação foi por e-mail e teve o push decidido, com o índice do resumo.
CREATE TABLE "inscricoes_de_push" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"aparelho" text NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_envio_em" timestamp with time zone,
	CONSTRAINT "inscricoes_de_push_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "inscricoes_de_push_endpoint_unico" UNIQUE("org_id","endpoint"),
	CONSTRAINT "inscricoes_de_push_endpoint_valido" CHECK ("inscricoes_de_push"."endpoint" ~ '^https?://' and length("inscricoes_de_push"."endpoint") <= 1000),
	CONSTRAINT "inscricoes_de_push_chaves_validas" CHECK ("inscricoes_de_push"."p256dh" ~ '^[A-Za-z0-9_-]{87}$' and "inscricoes_de_push"."auth" ~ '^[A-Za-z0-9_-]{22}$'),
	CONSTRAINT "inscricoes_de_push_aparelho_valido" CHECK (length("inscricoes_de_push"."aparelho") between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "notificacoes" ADD COLUMN "email_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD COLUMN "push_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inscricoes_de_push" ADD CONSTRAINT "inscricoes_de_push_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inscricoes_de_push" ADD CONSTRAINT "inscricoes_de_push_conta_fk" FOREIGN KEY ("org_id","conta_id") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inscricoes_de_push_da_conta_idx" ON "inscricoes_de_push" USING btree ("org_id","conta_id");--> statement-breakpoint
CREATE INDEX "notificacoes_para_o_resumo_idx" ON "notificacoes" USING btree ("org_id","conta_id") WHERE "notificacoes"."lida_em" is null and "notificacoes"."email_em" is null;--> statement-breakpoint
SELECT app.isolar_por_organizacao('inscricoes_de_push');
