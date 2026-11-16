-- O público de uma das permissões (change chamados-da-ti, design, decisão 13): quem tem uma delas, em
-- algum escopo, sem os locais, que seguem só com a permissão de uma só. O aviso do gatilho passa a
-- levar as permissões; os CHECKs do público as contam como uma das partes, com no máximo 8.
ALTER TABLE "eventos" DROP CONSTRAINT "eventos_publico_valido";--> statement-breakpoint
ALTER TABLE "eventos" DROP CONSTRAINT "eventos_publico_curto";--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "permissoes" text[];--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_publico_valido" CHECK (("eventos"."todas" or "eventos"."permissao" is not null or "eventos"."permissoes" is not null
          or "eventos"."contas" is not null or "eventos"."sessoes" is not null)
        and ("eventos"."locais" is null or "eventos"."permissao" is not null));--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_publico_curto" CHECK (coalesce(cardinality("eventos"."locais"), 0) <= 8
        and coalesce(cardinality("eventos"."permissoes"), 0) <= 8
        and coalesce(cardinality("eventos"."contas"), 0) <= 20
        and coalesce(cardinality("eventos"."sessoes"), 0) <= 20);--> statement-breakpoint
-- O aviso da 0013, com as permissões no público.
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
      'permissoes', NEW.permissoes,
      'contas', NEW.contas,
      'sessoes', NEW.sessoes
    ))
  )::text);
  RETURN NULL;
END
$$;
