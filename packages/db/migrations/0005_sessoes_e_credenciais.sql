CREATE TABLE "codigos_de_recuperacao" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"hash" "bytea" NOT NULL,
	"usado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "codigos_de_recuperacao_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "codigos_de_recuperacao_hash_unico" UNIQUE("conta_id","hash")
);
--> statement-breakpoint
CREATE TABLE "dois_passos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"segredo_cifrado" "bytea" NOT NULL,
	"ativado_em" timestamp with time zone,
	"ultimo_passo" bigint,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dois_passos_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "dois_passos_conta_unica" UNIQUE("conta_id")
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"token_csrf" text NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_uso_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"ativada_em" timestamp with time zone,
	"segundo_passo_em" timestamp with time zone,
	"tentativas_de_codigo" integer DEFAULT 0 NOT NULL,
	"encerrada_em" timestamp with time zone,
	"motivo_do_fim" text,
	"ip" "inet",
	"agente" text,
	CONSTRAINT "sessoes_token_hash_unico" UNIQUE("token_hash"),
	CONSTRAINT "sessoes_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "sessoes_fim_com_motivo" CHECK (("sessoes"."encerrada_em" is null) = ("sessoes"."motivo_do_fim" is null) and ("sessoes"."motivo_do_fim" is null or "sessoes"."motivo_do_fim" in ('saida', 'encerrada-pelo-usuario', 'outras-encerradas', 'senha-trocada', 'dois-passos-ativados', 'redefinicao', 'tentativas-esgotadas'))),
	CONSTRAINT "sessoes_tentativas_de_codigo" CHECK ("sessoes"."tentativas_de_codigo" >= 0),
	CONSTRAINT "sessoes_agente_curto" CHECK (length("sessoes"."agente") <= 512)
);
--> statement-breakpoint
CREATE TABLE "tentativas_de_entrada" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"usuario" text NOT NULL,
	"falhas_seguidas" integer DEFAULT 0 NOT NULL,
	"bloqueada_ate" timestamp with time zone,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tentativas_de_entrada_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "tentativas_de_entrada_usuario_unico" UNIQUE("org_id","usuario"),
	CONSTRAINT "tentativas_de_entrada_usuario" CHECK (length("tentativas_de_entrada"."usuario") between 1 and 64),
	CONSTRAINT "tentativas_de_entrada_falhas" CHECK ("tentativas_de_entrada"."falhas_seguidas" >= 0)
);
--> statement-breakpoint
ALTER TABLE "codigos_de_recuperacao" ADD CONSTRAINT "codigos_de_recuperacao_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codigos_de_recuperacao" ADD CONSTRAINT "codigos_de_recuperacao_conta_fk" FOREIGN KEY ("org_id","conta_id") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dois_passos" ADD CONSTRAINT "dois_passos_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dois_passos" ADD CONSTRAINT "dois_passos_conta_fk" FOREIGN KEY ("org_id","conta_id") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_conta_fk" FOREIGN KEY ("org_id","conta_id") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tentativas_de_entrada" ADD CONSTRAINT "tentativas_de_entrada_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessoes_conta_idx" ON "sessoes" USING btree ("org_id","conta_id");
--> statement-breakpoint
-- Isolamento por organização (spec isolamento-organizacoes).
SELECT app.isolar_por_organizacao('sessoes');
--> statement-breakpoint
SELECT app.isolar_por_organizacao('tentativas_de_entrada');
--> statement-breakpoint
SELECT app.isolar_por_organizacao('dois_passos');
--> statement-breakpoint
SELECT app.isolar_por_organizacao('codigos_de_recuperacao');
