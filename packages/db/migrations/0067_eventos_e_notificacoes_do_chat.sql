-- Os eventos e as notificações do chat (change chat-com-chamados, design, decisões 4 e 6). Os grupos
-- restringem a permissão do público, como os locais, com no máximo 8 e só com a permissão, e o aviso
-- do gatilho passa a levá-los. A notificação ganha a marca da mensagem, o assunto, que a leitura da
-- conversa ou do chamado marca como lido, e a mensagem do chat de que ela trata; o índice das não
-- lidas passa a ir pelo assunto. O que a versão anterior grava continua aceito: ela não conhece as
-- colunas novas, que ficam nos padrões.
ALTER TABLE "eventos" DROP CONSTRAINT "eventos_publico_valido";--> statement-breakpoint
ALTER TABLE "eventos" DROP CONSTRAINT "eventos_publico_curto";--> statement-breakpoint
DROP INDEX "notificacoes_nao_lidas_idx";--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "grupos" uuid[];--> statement-breakpoint
ALTER TABLE "notificacoes" ADD COLUMN "mensagem" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD COLUMN "assunto" text;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD COLUMN "mensagem_do_chat_id" uuid;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_mensagem_do_chat_fk" FOREIGN KEY ("org_id","mensagem_do_chat_id") REFERENCES "public"."mensagens_do_chat"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notificacoes_nao_lidas_idx" ON "notificacoes" USING btree ("org_id","conta_id","assunto") WHERE "notificacoes"."lida_em" is null;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_publico_valido" CHECK (("eventos"."todas" or "eventos"."permissao" is not null or "eventos"."permissoes" is not null
          or "eventos"."contas" is not null or "eventos"."sessoes" is not null)
        and ("eventos"."locais" is null or "eventos"."permissao" is not null)
        and ("eventos"."grupos" is null or "eventos"."permissao" is not null));--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_publico_curto" CHECK (coalesce(cardinality("eventos"."locais"), 0) <= 8
        and coalesce(cardinality("eventos"."grupos"), 0) <= 8
        and coalesce(cardinality("eventos"."permissoes"), 0) <= 8
        and coalesce(cardinality("eventos"."contas"), 0) <= 20
        and coalesce(cardinality("eventos"."sessoes"), 0) <= 20);--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_assunto_valido" CHECK ("notificacoes"."assunto" is null or (length("notificacoes"."assunto") <= 80 and "notificacoes"."assunto" ~ '^[a-z-]+:[0-9a-z-]+$'));--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_mensagem_coerente" CHECK ((not "notificacoes"."mensagem" or "notificacoes"."assunto" is not null)
        and ("notificacoes"."mensagem_do_chat_id" is null
          or ("notificacoes"."mensagem" and "notificacoes"."assunto" is not null and "notificacoes"."assunto" like 'conversa:%')));--> statement-breakpoint
-- O aviso da 0063, com os grupos no público.
CREATE OR REPLACE FUNCTION app.avisar_evento() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  PERFORM pg_notify('grafite_eventos', json_build_object(
    'id', NEW.id,
    'orgId', NEW.org_id,
    'momento', to_char(NEW.momento AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'tipo', NEW.tipo,
    'alvo', CASE WHEN NEW.alvo_tipo IS NULL THEN NULL
                 ELSE json_build_object('tipo', NEW.alvo_tipo, 'id', NEW.alvo_id) END,
    'publico', json_strip_nulls(json_build_object(
      'todas', CASE WHEN NEW.todas THEN true END,
      'permissao', NEW.permissao,
      'locais', NEW.locais,
      'grupos', NEW.grupos,
      'permissoes', NEW.permissoes,
      'contas', NEW.contas,
      'sessoes', NEW.sessoes
    ))
  )::text);
  RETURN NULL;
END
$$;
