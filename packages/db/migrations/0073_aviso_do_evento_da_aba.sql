-- Change aba-dos-colaboradores (pontos da revisão da tarefa 1.1): o aviso da 0067, com as partes da
-- aba no público, nos nomes do domínio. Sem elas, o evento ao vivo da aba chegaria vazio.
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
      'sessoes', NEW.sessoes,
      'sessoesDaAba', NEW.sessoes_da_aba,
      'aparelhos', NEW.aparelhos_da_aba,
      'abas', CASE WHEN NEW.abas THEN true END
    ))
  )::text);
  RETURN NULL;
END
$$;
