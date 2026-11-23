-- O que muda nos chamados com o chat (spec chamados; change chat-com-chamados, design, decisão 2):
-- a origem `chat`, com a conversa e a mensagem, que vira um chamado só; o `fechado_em`, só no
-- resolvido; na conversa, a cópia da mensagem de origem, as opções da pergunta, o cartão do ativo,
-- a primeira escolha de cada pergunta, uma avaliação por resolução e o `fechou`, o único evento sem
-- autor; a leitura de cada conta; e as opções das respostas prontas. Os CHECKs só se alargam: o que
-- a versão anterior grava continua aceito.
CREATE TABLE "leituras_dos_chamados" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"chamado_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"vista_ate" uuid NOT NULL,
	CONSTRAINT "leituras_dos_chamados_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "leituras_dos_chamados_unica" UNIQUE("org_id","conta_id","chamado_id")
);
--> statement-breakpoint
ALTER TABLE "chamados" DROP CONSTRAINT "chamados_origem_valida";--> statement-breakpoint
ALTER TABLE "mensagens_dos_chamados" DROP CONSTRAINT "mensagens_dos_chamados_especie_valida";--> statement-breakpoint
ALTER TABLE "mensagens_dos_chamados" DROP CONSTRAINT "mensagens_dos_chamados_autoria_valida";--> statement-breakpoint
ALTER TABLE "mensagens_dos_chamados" DROP CONSTRAINT "mensagens_dos_chamados_conteudo_valido";--> statement-breakpoint
ALTER TABLE "chamados" ADD COLUMN "origem_conversa_id" uuid;--> statement-breakpoint
ALTER TABLE "chamados" ADD COLUMN "origem_mensagem_id" uuid;--> statement-breakpoint
ALTER TABLE "chamados" ADD COLUMN "fechado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mensagens_dos_chamados" ADD COLUMN "opcoes" text[];--> statement-breakpoint
ALTER TABLE "mensagens_dos_chamados" ADD COLUMN "cartao" jsonb;--> statement-breakpoint
ALTER TABLE "respostas_prontas" ADD COLUMN "opcoes" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "leituras_dos_chamados" ADD CONSTRAINT "leituras_dos_chamados_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leituras_dos_chamados" ADD CONSTRAINT "leituras_dos_chamados_chamado_fk" FOREIGN KEY ("org_id","chamado_id") REFERENCES "public"."chamados"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leituras_dos_chamados" ADD CONSTRAINT "leituras_dos_chamados_conta_fk" FOREIGN KEY ("org_id","conta_id") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leituras_dos_chamados" ADD CONSTRAINT "leituras_dos_chamados_vista_ate_fk" FOREIGN KEY ("org_id","vista_ate","chamado_id") REFERENCES "public"."mensagens_dos_chamados"("org_id","id","chamado_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_origem_conversa_fk" FOREIGN KEY ("org_id","origem_conversa_id") REFERENCES "public"."conversas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_origem_mensagem_fk" FOREIGN KEY ("org_id","origem_mensagem_id","origem_conversa_id") REFERENCES "public"."mensagens_do_chat"("org_id","id","conversa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chamados_origem_conversa_idx" ON "chamados" USING btree ("org_id","origem_conversa_id") WHERE "chamados"."origem_conversa_id" is not null;--> statement-breakpoint
CREATE INDEX "chamados_aberto_pelo_chat_idx" ON "chamados" USING btree ("org_id","aberto_por") WHERE "chamados"."origem" = 'chat';--> statement-breakpoint
CREATE INDEX "chamados_a_fechar_idx" ON "chamados" USING btree ("org_id","resolvido_em") WHERE "chamados"."situacao" = 'resolvido' and "chamados"."fechado_em" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "mensagens_dos_chamados_origem_unica" ON "mensagens_dos_chamados" USING btree ("org_id","chamado_id") WHERE "mensagens_dos_chamados"."especie" = 'origem';--> statement-breakpoint
CREATE UNIQUE INDEX "mensagens_dos_chamados_escolha_unica" ON "mensagens_dos_chamados" USING btree ("org_id",("dados" ->> 'mensagem')) WHERE "mensagens_dos_chamados"."evento" = 'escolheu';--> statement-breakpoint
CREATE UNIQUE INDEX "mensagens_dos_chamados_avaliacao_unica" ON "mensagens_dos_chamados" USING btree ("org_id","chamado_id",("dados" ->> 'resolucao')) WHERE "mensagens_dos_chamados"."evento" = 'avaliou';--> statement-breakpoint
CREATE UNIQUE INDEX "mensagens_dos_chamados_fechou_unico" ON "mensagens_dos_chamados" USING btree ("org_id","chamado_id") WHERE "mensagens_dos_chamados"."evento" = 'fechou';--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_origem_mensagem_unica" UNIQUE("org_id","origem_mensagem_id");--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_origem_coerente" CHECK (("chamados"."origem_conversa_id" is null) = ("chamados"."origem_mensagem_id" is null)
        and ("chamados"."origem" <> 'chat' or ("chamados"."aberto_por" is not null and "chamados"."origem_mensagem_id" is not null))
        and ("chamados"."origem" = 'chat' or "chamados"."origem_mensagem_id" is null));--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_fechamento_coerente" CHECK ("chamados"."fechado_em" is null or ("chamados"."situacao" = 'resolvido' and "chamados"."resolvido_em" is not null
        and "chamados"."fechado_em" > "chamados"."resolvido_em"));--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_origem_valida" CHECK ("chamados"."origem" in ('ti', 'chat'));--> statement-breakpoint
ALTER TABLE "mensagens_dos_chamados" ADD CONSTRAINT "mensagens_dos_chamados_opcoes_validas" CHECK ("mensagens_dos_chamados"."opcoes" is null or ("mensagens_dos_chamados"."especie" = 'mensagem' and "mensagens_dos_chamados"."autor_conta" is not null
        and array_ndims("mensagens_dos_chamados"."opcoes") = 1 and array_lower("mensagens_dos_chamados"."opcoes", 1) = 1
    and cardinality("mensagens_dos_chamados"."opcoes") between 2 and 3 and array_position("mensagens_dos_chamados"."opcoes", null) is null
    and length(trim("mensagens_dos_chamados"."opcoes"[1])) between 1 and 40 and length(trim("mensagens_dos_chamados"."opcoes"[2])) between 1 and 40
    and (cardinality("mensagens_dos_chamados"."opcoes") = 2 or length(trim("mensagens_dos_chamados"."opcoes"[3])) between 1 and 40)));--> statement-breakpoint
ALTER TABLE "mensagens_dos_chamados" ADD CONSTRAINT "mensagens_dos_chamados_cartao_valido" CHECK ("mensagens_dos_chamados"."cartao" is null or ("mensagens_dos_chamados"."especie" in ('mensagem', 'nota') and "mensagens_dos_chamados"."autor_conta" is not null
        and jsonb_typeof("mensagens_dos_chamados"."cartao") = 'object' and octet_length("mensagens_dos_chamados"."cartao"::text) <= 4096));--> statement-breakpoint
ALTER TABLE "mensagens_dos_chamados" ADD CONSTRAINT "mensagens_dos_chamados_especie_valida" CHECK ("mensagens_dos_chamados"."especie" in ('mensagem', 'nota', 'evento', 'origem'));--> statement-breakpoint
ALTER TABLE "mensagens_dos_chamados" ADD CONSTRAINT "mensagens_dos_chamados_autoria_valida" CHECK (("mensagens_dos_chamados"."especie" <> 'mensagem' or num_nonnulls("mensagens_dos_chamados"."autor_conta", "mensagens_dos_chamados"."autor_pessoa") = 1)
        and ("mensagens_dos_chamados"."especie" <> 'nota' or ("mensagens_dos_chamados"."autor_conta" is not null and "mensagens_dos_chamados"."autor_pessoa" is null))
        and ("mensagens_dos_chamados"."especie" <> 'evento' or ("mensagens_dos_chamados"."autor_pessoa" is null
          and ("mensagens_dos_chamados"."autor_conta" is not null or "mensagens_dos_chamados"."evento" = 'fechou')))
        and ("mensagens_dos_chamados"."especie" <> 'origem' or ("mensagens_dos_chamados"."autor_conta" is not null and "mensagens_dos_chamados"."autor_pessoa" is null)));--> statement-breakpoint
ALTER TABLE "mensagens_dos_chamados" ADD CONSTRAINT "mensagens_dos_chamados_conteudo_valido" CHECK (("mensagens_dos_chamados"."especie" not in ('mensagem', 'nota', 'origem') or ("mensagens_dos_chamados"."texto" is not null
          and length(trim("mensagens_dos_chamados"."texto")) between 1 and 4000 and "mensagens_dos_chamados"."evento" is null))
        and ("mensagens_dos_chamados"."especie" not in ('mensagem', 'nota') or "mensagens_dos_chamados"."dados" is null)
        and ("mensagens_dos_chamados"."especie" <> 'origem' or "mensagens_dos_chamados"."dados" is not null)
        and ("mensagens_dos_chamados"."especie" <> 'evento' or ("mensagens_dos_chamados"."evento" is not null and "mensagens_dos_chamados"."texto" is null)));--> statement-breakpoint
ALTER TABLE "respostas_prontas" ADD CONSTRAINT "respostas_prontas_opcoes_validas" CHECK (cardinality("respostas_prontas"."opcoes") = 0 or (array_ndims("respostas_prontas"."opcoes") = 1 and array_lower("respostas_prontas"."opcoes", 1) = 1
    and cardinality("respostas_prontas"."opcoes") between 2 and 3 and array_position("respostas_prontas"."opcoes", null) is null
    and length(trim("respostas_prontas"."opcoes"[1])) between 1 and 40 and length(trim("respostas_prontas"."opcoes"[2])) between 1 and 40
    and (cardinality("respostas_prontas"."opcoes") = 2 or length(trim("respostas_prontas"."opcoes"[3])) between 1 and 40)));--> statement-breakpoint
SELECT app.isolar_por_organizacao('leituras_dos_chamados');--> statement-breakpoint
-- A leitura guarda o que a conta viu do chamado, e não sai.
REVOKE DELETE ON leituras_dos_chamados FROM grafite_app;
