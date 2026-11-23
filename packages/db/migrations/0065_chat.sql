-- O chat (spec chat; change chat-com-chamados, design, decisão 1): as conversas diretas, as equipes e
-- os canais, com o cadastro nas próprias colunas; as mensagens, só de inclusão; as reações, as únicas
-- que o papel da aplicação apaga; os anexos, que nascem sem dono e passam à mensagem; e a leitura de
-- cada conta, com o silenciar. Todas isoladas pela organização.
CREATE TABLE "anexos_do_chat" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"arquivo_id" uuid NOT NULL,
	"conversa_id" uuid,
	"mensagem_id" uuid,
	CONSTRAINT "anexos_do_chat_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "anexos_do_chat_arquivo_unico" UNIQUE("org_id","arquivo_id"),
	CONSTRAINT "anexos_do_chat_dono_valido" CHECK (("anexos_do_chat"."conversa_id" is null) = ("anexos_do_chat"."mensagem_id" is null))
);
--> statement-breakpoint
CREATE TABLE "conversas" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultima_mensagem_em" timestamp with time zone,
	"conta_a" uuid,
	"conta_b" uuid,
	"nome" text,
	"nome_normalizado" text,
	"grupo_id" uuid,
	"escreve_grupo_id" uuid,
	"avisar" boolean DEFAULT false NOT NULL,
	"arquivada_em" timestamp with time zone,
	CONSTRAINT "conversas_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "conversas_tipo_valido" CHECK ("conversas"."tipo" in ('direta', 'equipe', 'canal')),
	CONSTRAINT "conversas_colunas_do_tipo" CHECK (("conversas"."tipo" <> 'direta' or ("conversas"."conta_a" is not null and "conversas"."conta_b" is not null
          and "conversas"."conta_a" < "conversas"."conta_b" and "conversas"."ultima_mensagem_em" is not null and not "conversas"."avisar"
          and num_nonnulls("conversas"."nome", "conversas"."nome_normalizado", "conversas"."grupo_id", "conversas"."escreve_grupo_id",
            "conversas"."arquivada_em") = 0))
        and ("conversas"."tipo" not in ('equipe', 'canal') or ("conversas"."conta_a" is null and "conversas"."conta_b" is null
          and "conversas"."nome" is not null and "conversas"."nome_normalizado" is not null))
        and ("conversas"."tipo" <> 'equipe' or "conversas"."grupo_id" is not null)
        and ("conversas"."tipo" <> 'canal' or "conversas"."grupo_id" is null)),
	CONSTRAINT "conversas_nome_valido" CHECK (("conversas"."nome" is null or length(trim("conversas"."nome")) between 1 and 60))
);
--> statement-breakpoint
CREATE TABLE "leituras_das_conversas" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"lida_ate" uuid,
	"silenciada" boolean DEFAULT false NOT NULL,
	CONSTRAINT "leituras_das_conversas_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "leituras_das_conversas_unica" UNIQUE("org_id","conta_id","conversa_id")
);
--> statement-breakpoint
CREATE TABLE "mensagens_do_chat" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"especie" text NOT NULL,
	"autor_conta" uuid NOT NULL,
	"texto" text,
	"responde_a" uuid,
	"evento" text,
	"dados" jsonb,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mensagens_do_chat_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "mensagens_do_chat_id_conversa_unico" UNIQUE("org_id","id","conversa_id"),
	CONSTRAINT "mensagens_do_chat_especie_valida" CHECK ("mensagens_do_chat"."especie" in ('mensagem', 'evento')),
	CONSTRAINT "mensagens_do_chat_conteudo_valido" CHECK (("mensagens_do_chat"."especie" <> 'mensagem' or ("mensagens_do_chat"."texto" is not null
          and length(trim("mensagens_do_chat"."texto")) between 1 and 4000 and "mensagens_do_chat"."evento" is null and "mensagens_do_chat"."dados" is null))
        and ("mensagens_do_chat"."especie" <> 'evento' or ("mensagens_do_chat"."evento" is not null and "mensagens_do_chat"."texto" is null
          and "mensagens_do_chat"."responde_a" is null))),
	CONSTRAINT "mensagens_do_chat_evento_valido" CHECK ("mensagens_do_chat"."evento" is null or "mensagens_do_chat"."evento" ~ '^[a-z][a-z-]{0,39}$'),
	CONSTRAINT "mensagens_do_chat_dados_validos" CHECK ("mensagens_do_chat"."dados" is null or (jsonb_typeof("mensagens_do_chat"."dados") = 'object' and octet_length("mensagens_do_chat"."dados"::text) <= 16384))
);
--> statement-breakpoint
CREATE TABLE "reacoes_das_mensagens" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"mensagem_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"texto" text NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reacoes_das_mensagens_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "reacoes_das_mensagens_unica" UNIQUE("org_id","mensagem_id","texto","conta_id"),
	CONSTRAINT "reacoes_das_mensagens_texto_valido" CHECK (length(trim("reacoes_das_mensagens"."texto")) between 1 and 20)
);
--> statement-breakpoint
ALTER TABLE "anexos_do_chat" ADD CONSTRAINT "anexos_do_chat_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexos_do_chat" ADD CONSTRAINT "anexos_do_chat_arquivo_fk" FOREIGN KEY ("org_id","arquivo_id") REFERENCES "public"."arquivos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexos_do_chat" ADD CONSTRAINT "anexos_do_chat_conversa_fk" FOREIGN KEY ("org_id","conversa_id") REFERENCES "public"."conversas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexos_do_chat" ADD CONSTRAINT "anexos_do_chat_mensagem_fk" FOREIGN KEY ("org_id","mensagem_id","conversa_id") REFERENCES "public"."mensagens_do_chat"("org_id","id","conversa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_conta_a_fk" FOREIGN KEY ("org_id","conta_a") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_conta_b_fk" FOREIGN KEY ("org_id","conta_b") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_grupo_fk" FOREIGN KEY ("org_id","grupo_id") REFERENCES "public"."grupos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_escreve_grupo_fk" FOREIGN KEY ("org_id","escreve_grupo_id") REFERENCES "public"."grupos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leituras_das_conversas" ADD CONSTRAINT "leituras_das_conversas_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leituras_das_conversas" ADD CONSTRAINT "leituras_das_conversas_conversa_fk" FOREIGN KEY ("org_id","conversa_id") REFERENCES "public"."conversas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leituras_das_conversas" ADD CONSTRAINT "leituras_das_conversas_conta_fk" FOREIGN KEY ("org_id","conta_id") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leituras_das_conversas" ADD CONSTRAINT "leituras_das_conversas_lida_ate_fk" FOREIGN KEY ("org_id","lida_ate","conversa_id") REFERENCES "public"."mensagens_do_chat"("org_id","id","conversa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_do_chat" ADD CONSTRAINT "mensagens_do_chat_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_do_chat" ADD CONSTRAINT "mensagens_do_chat_conversa_fk" FOREIGN KEY ("org_id","conversa_id") REFERENCES "public"."conversas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_do_chat" ADD CONSTRAINT "mensagens_do_chat_autor_conta_fk" FOREIGN KEY ("org_id","autor_conta") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_do_chat" ADD CONSTRAINT "mensagens_do_chat_responde_a_fk" FOREIGN KEY ("org_id","responde_a","conversa_id") REFERENCES "public"."mensagens_do_chat"("org_id","id","conversa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reacoes_das_mensagens" ADD CONSTRAINT "reacoes_das_mensagens_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reacoes_das_mensagens" ADD CONSTRAINT "reacoes_das_mensagens_mensagem_fk" FOREIGN KEY ("org_id","mensagem_id") REFERENCES "public"."mensagens_do_chat"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reacoes_das_mensagens" ADD CONSTRAINT "reacoes_das_mensagens_conta_fk" FOREIGN KEY ("org_id","conta_id") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anexos_do_chat_conversa_idx" ON "anexos_do_chat" USING btree ("org_id","conversa_id","mensagem_id") WHERE "anexos_do_chat"."conversa_id" is not null;--> statement-breakpoint
CREATE INDEX "anexos_do_chat_sem_dono_idx" ON "anexos_do_chat" USING btree ("org_id","arquivo_id") WHERE "anexos_do_chat"."conversa_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "conversas_direta_unica" ON "conversas" USING btree ("org_id","conta_a","conta_b") WHERE "conversas"."tipo" = 'direta';--> statement-breakpoint
CREATE INDEX "conversas_direta_conta_b_idx" ON "conversas" USING btree ("org_id","conta_b") WHERE "conversas"."tipo" = 'direta';--> statement-breakpoint
CREATE UNIQUE INDEX "conversas_nome_unico" ON "conversas" USING btree ("org_id","nome_normalizado") WHERE "conversas"."tipo" <> 'direta' and "conversas"."arquivada_em" is null;--> statement-breakpoint
CREATE INDEX "conversas_equipe_grupo_idx" ON "conversas" USING btree ("org_id","grupo_id") WHERE "conversas"."tipo" = 'equipe';--> statement-breakpoint
CREATE INDEX "mensagens_do_chat_conversa_idx" ON "mensagens_do_chat" USING btree ("org_id","conversa_id","id");--> statement-breakpoint
SELECT app.isolar_por_organizacao('conversas');--> statement-breakpoint
SELECT app.isolar_por_organizacao('mensagens_do_chat');--> statement-breakpoint
SELECT app.isolar_por_organizacao('reacoes_das_mensagens');--> statement-breakpoint
SELECT app.isolar_por_organizacao('anexos_do_chat');--> statement-breakpoint
SELECT app.isolar_por_organizacao('leituras_das_conversas');--> statement-breakpoint
-- A conversa não se apaga (spec chat, "Conversas"): a equipe e o canal se arquivam.
REVOKE DELETE ON conversas FROM grafite_app;--> statement-breakpoint
-- A mensagem não se edita nem se apaga (spec chat, "Mensagem").
REVOKE UPDATE, DELETE ON mensagens_do_chat FROM grafite_app;--> statement-breakpoint
-- A reação vai e volta: reagir de novo apaga a linha, que nunca muda.
REVOKE UPDATE ON reacoes_das_mensagens FROM grafite_app;--> statement-breakpoint
-- O anexo não se apaga: a linha liga o arquivo à mensagem, e o sem dono há mais de 24 h ganha o
-- `removido_em` no arquivo.
REVOKE DELETE ON anexos_do_chat FROM grafite_app;--> statement-breakpoint
-- A leitura guarda o estado da conta na conversa, e não sai.
REVOKE DELETE ON leituras_das_conversas FROM grafite_app;
