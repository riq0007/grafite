-- Os eventos de saída (spec eventos-em-tempo-real; design do F2c, decisões 9 e 10): gravados na
-- transação da mudança, com quem pode recebê-los, e avisados à API pelo canal grafite_eventos. O
-- NOTIFY só é entregue depois do commit, e o de uma transação desfeita nunca sai.
CREATE TABLE "eventos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"momento" timestamp with time zone DEFAULT now() NOT NULL,
	"tipo" text NOT NULL,
	"alvo_tipo" text,
	"alvo_id" uuid,
	"todas" boolean DEFAULT false NOT NULL,
	"permissao" text,
	"locais" uuid[],
	"contas" uuid[],
	"sessoes" uuid[],
	CONSTRAINT "eventos_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "eventos_tipo_valido" CHECK ("eventos"."tipo" ~ '^[a-z-]+[.][a-z-]+$'),
	CONSTRAINT "eventos_publico_valido" CHECK (("eventos"."todas" or "eventos"."permissao" is not null or "eventos"."contas" is not null
          or "eventos"."sessoes" is not null)
        and ("eventos"."locais" is null or "eventos"."permissao" is not null)),
	CONSTRAINT "eventos_publico_curto" CHECK (coalesce(cardinality("eventos"."locais"), 0) <= 8
        and coalesce(cardinality("eventos"."contas"), 0) <= 20
        and coalesce(cardinality("eventos"."sessoes"), 0) <= 20)
);
--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eventos_momento_idx" ON "eventos" USING btree ("org_id","momento");
--> statement-breakpoint
-- Isolamento por organização (spec isolamento-organizacoes).
SELECT app.isolar_por_organizacao('eventos');
--> statement-breakpoint
-- O aviso leva o evento inteiro, que são só o tipo, a organização, o momento e identificadores: o
-- check eventos_publico_curto mantém a carga longe do limite de 8000 bytes do NOTIFY.
CREATE FUNCTION app.avisar_evento() RETURNS trigger
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
      'contas', NEW.contas,
      'sessoes', NEW.sessoes
    ))
  )::text);
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER eventos_avisar AFTER INSERT ON eventos
  FOR EACH ROW EXECUTE FUNCTION app.avisar_evento();
