-- A aba dos colaboradores (change aba-dos-colaboradores, design, decisões 3, 5 e 8): a chave, a
-- configuração, os aparelhos, as sessões e os bilhetes da aba; as aberturas da conversa do
-- chamado, da resposta por ver; e o alcance da sessão comum, com a sessão da aba do chat na aba.
-- O papel da aplicação não apaga o que é histórico: o aparelho é bloqueado, a sessão termina.
CREATE TABLE "aberturas_dos_chamados" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"chamado_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"aberta_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aberturas_dos_chamados_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "aberturas_dos_chamados_unica" UNIQUE("org_id","conta_id","chamado_id")
);
--> statement-breakpoint
CREATE TABLE "aparelhos_da_aba" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"identificador_da_maquina" text NOT NULL,
	"identificador_curto" text NOT NULL,
	"nome" text NOT NULL,
	"versao" text,
	"entrada" text DEFAULT 'windows' NOT NULL,
	"teto_de_contas" integer DEFAULT 5 NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"registrado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_contato_em" timestamp with time zone,
	"bloqueado_em" timestamp with time zone,
	CONSTRAINT "aparelhos_da_aba_token_hash_unico" UNIQUE("token_hash"),
	CONSTRAINT "aparelhos_da_aba_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "aparelhos_da_aba_maquina_unica" UNIQUE("org_id","identificador_da_maquina"),
	CONSTRAINT "aparelhos_da_aba_identificador_curto_unico" UNIQUE("org_id","identificador_curto"),
	CONSTRAINT "aparelhos_da_aba_identificador_curto_valido" CHECK ("aparelhos_da_aba"."identificador_curto" ~ '^[0-9A-HJKMNP-TV-Z]{6}$'),
	CONSTRAINT "aparelhos_da_aba_identificador_da_maquina_valido" CHECK (length("aparelhos_da_aba"."identificador_da_maquina") between 1 and 64),
	CONSTRAINT "aparelhos_da_aba_nome_valido" CHECK (length(trim("aparelhos_da_aba"."nome")) between 1 and 63),
	CONSTRAINT "aparelhos_da_aba_versao_valida" CHECK ("aparelhos_da_aba"."versao" is null or length("aparelhos_da_aba"."versao") <= 40),
	CONSTRAINT "aparelhos_da_aba_entrada_valida" CHECK ("aparelhos_da_aba"."entrada" in ('windows', 'senha')),
	CONSTRAINT "aparelhos_da_aba_teto_valido" CHECK ("aparelhos_da_aba"."teto_de_contas" between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "bilhetes_da_aba" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"hash" "bytea" NOT NULL,
	"sessao_da_aba_id" uuid NOT NULL,
	"destino" text NOT NULL,
	"chamado_numero" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"usado_em" timestamp with time zone,
	CONSTRAINT "bilhetes_da_aba_hash_unico" UNIQUE("hash"),
	CONSTRAINT "bilhetes_da_aba_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "bilhetes_da_aba_destino_valido" CHECK ("bilhetes_da_aba"."destino" in ('chat', 'chamado') and ("bilhetes_da_aba"."destino" = 'chamado') = ("bilhetes_da_aba"."chamado_numero" is not null))
);
--> statement-breakpoint
CREATE TABLE "chaves_da_aba" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"hash" "bytea" NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"trocada_em" timestamp with time zone,
	CONSTRAINT "chaves_da_aba_hash_unico" UNIQUE("hash"),
	CONSTRAINT "chaves_da_aba_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "chaves_da_aba_uma_por_organizacao" UNIQUE("org_id")
);
--> statement-breakpoint
CREATE TABLE "configuracoes_da_aba" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"forma" text DEFAULT 'pilula' NOT NULL,
	"contato" text,
	"versao" integer DEFAULT 1 NOT NULL,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "configuracoes_da_aba_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "configuracoes_da_aba_uma_por_organizacao" UNIQUE("org_id"),
	CONSTRAINT "configuracoes_da_aba_forma_valida" CHECK ("configuracoes_da_aba"."forma" in ('pilula', 'entalhe')),
	CONSTRAINT "configuracoes_da_aba_contato_valido" CHECK ("configuracoes_da_aba"."contato" is null or length(trim("configuracoes_da_aba"."contato")) between 1 and 80),
	CONSTRAINT "configuracoes_da_aba_versao_valida" CHECK ("configuracoes_da_aba"."versao" >= 1)
);
--> statement-breakpoint
CREATE TABLE "sessoes_da_aba" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"aparelho_id" uuid NOT NULL,
	"entrada" text NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ativada_em" timestamp with time zone,
	"ultimo_uso_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"tentativas_de_codigo" integer DEFAULT 0 NOT NULL,
	"encerrada_em" timestamp with time zone,
	"motivo_do_fim" text,
	"ip" "inet",
	CONSTRAINT "sessoes_da_aba_token_hash_unico" UNIQUE("token_hash"),
	CONSTRAINT "sessoes_da_aba_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "sessoes_da_aba_entrada_valida" CHECK ("sessoes_da_aba"."entrada" in ('windows', 'senha')),
	CONSTRAINT "sessoes_da_aba_fim_com_motivo" CHECK (("sessoes_da_aba"."encerrada_em" is null) = ("sessoes_da_aba"."motivo_do_fim" is null) and ("sessoes_da_aba"."motivo_do_fim" is null or "sessoes_da_aba"."motivo_do_fim" in ('saida', 'encerrada-pelo-usuario', 'outras-encerradas', 'senha-trocada', 'dois-passos-ativados', 'redefinicao', 'tentativas-esgotadas', 'conta-inativada', 'encerrada-pela-administracao', 'dois-passos-removidos', 'aparelho-bloqueado', 'pessoa-recusada', 'sem-uso', 'outra-sessao-no-aparelho'))),
	CONSTRAINT "sessoes_da_aba_tentativas_de_codigo" CHECK ("sessoes_da_aba"."tentativas_de_codigo" >= 0)
);
--> statement-breakpoint
ALTER TABLE "sessoes" ADD COLUMN "alcance" text DEFAULT 'comum' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessoes" ADD COLUMN "sessao_da_aba_id" uuid;--> statement-breakpoint
ALTER TABLE "aberturas_dos_chamados" ADD CONSTRAINT "aberturas_dos_chamados_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aberturas_dos_chamados" ADD CONSTRAINT "aberturas_dos_chamados_chamado_fk" FOREIGN KEY ("org_id","chamado_id") REFERENCES "public"."chamados"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aberturas_dos_chamados" ADD CONSTRAINT "aberturas_dos_chamados_conta_fk" FOREIGN KEY ("org_id","conta_id") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aparelhos_da_aba" ADD CONSTRAINT "aparelhos_da_aba_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bilhetes_da_aba" ADD CONSTRAINT "bilhetes_da_aba_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bilhetes_da_aba" ADD CONSTRAINT "bilhetes_da_aba_sessao_fk" FOREIGN KEY ("org_id","sessao_da_aba_id") REFERENCES "public"."sessoes_da_aba"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chaves_da_aba" ADD CONSTRAINT "chaves_da_aba_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuracoes_da_aba" ADD CONSTRAINT "configuracoes_da_aba_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes_da_aba" ADD CONSTRAINT "sessoes_da_aba_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes_da_aba" ADD CONSTRAINT "sessoes_da_aba_conta_fk" FOREIGN KEY ("org_id","conta_id") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes_da_aba" ADD CONSTRAINT "sessoes_da_aba_aparelho_fk" FOREIGN KEY ("org_id","aparelho_id") REFERENCES "public"."aparelhos_da_aba"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sessoes_da_aba_uma_aberta_por_conta_e_aparelho" ON "sessoes_da_aba" USING btree ("org_id","conta_id","aparelho_id") WHERE "sessoes_da_aba"."encerrada_em" is null;--> statement-breakpoint
CREATE INDEX "sessoes_da_aba_aparelho_idx" ON "sessoes_da_aba" USING btree ("org_id","aparelho_id");--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_sessao_da_aba_fk" FOREIGN KEY ("org_id","sessao_da_aba_id") REFERENCES "public"."sessoes_da_aba"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_alcance_valido" CHECK ("sessoes"."alcance" in ('comum', 'chat-da-aba') and ("sessoes"."alcance" = 'chat-da-aba') = ("sessoes"."sessao_da_aba_id" is not null));--> statement-breakpoint
SELECT app.isolar_por_organizacao('chaves_da_aba');--> statement-breakpoint
SELECT app.isolar_por_organizacao('configuracoes_da_aba');--> statement-breakpoint
SELECT app.isolar_por_organizacao('aparelhos_da_aba');--> statement-breakpoint
SELECT app.isolar_por_organizacao('sessoes_da_aba');--> statement-breakpoint
SELECT app.isolar_por_organizacao('bilhetes_da_aba');--> statement-breakpoint
SELECT app.isolar_por_organizacao('aberturas_dos_chamados');--> statement-breakpoint
REVOKE DELETE ON chaves_da_aba FROM grafite_app;--> statement-breakpoint
REVOKE DELETE ON configuracoes_da_aba FROM grafite_app;--> statement-breakpoint
REVOKE DELETE ON aparelhos_da_aba FROM grafite_app;--> statement-breakpoint
REVOKE DELETE ON sessoes_da_aba FROM grafite_app;--> statement-breakpoint
REVOKE DELETE ON aberturas_dos_chamados FROM grafite_app;