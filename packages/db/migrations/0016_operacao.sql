-- Os registros da operação do servidor (specs backup e isolamento-organizacoes; design do F2d,
-- decisão 14): o esquema `operacao`, fora das organizações e sem RLS, como o da fila.
CREATE SCHEMA "operacao";
--> statement-breakpoint
CREATE TABLE "operacao"."agenda" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"horario" text DEFAULT '02:00' NOT NULL,
	"dia_do_teste" smallint DEFAULT 0 NOT NULL,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agenda_uma_linha" CHECK ("operacao"."agenda"."id" = 1),
	CONSTRAINT "agenda_horario_valido" CHECK ("operacao"."agenda"."horario" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "agenda_dia_do_teste_valido" CHECK ("operacao"."agenda"."dia_do_teste" between 0 and 6)
);
--> statement-breakpoint
CREATE TABLE "operacao"."backups" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"iniciado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"terminado_em" timestamp with time zone,
	"situacao" text DEFAULT 'em-andamento' NOT NULL,
	"pedido_por" text NOT NULL,
	"tamanho" bigint,
	"destinos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pasta" text,
	"manifesto" jsonb,
	"erro" text,
	"removido_em" timestamp with time zone,
	CONSTRAINT "backups_situacao_valida" CHECK ("operacao"."backups"."situacao" in ('em-andamento', 'feito', 'falhou')),
	CONSTRAINT "backups_pedido_por_valido" CHECK ("operacao"."backups"."pedido_por" in ('agenda', 'tela', 'comando')),
	CONSTRAINT "backups_fim_com_a_situacao" CHECK (("operacao"."backups"."situacao" = 'em-andamento') = ("operacao"."backups"."terminado_em" is null)),
	CONSTRAINT "backups_erro_so_na_falha" CHECK (("operacao"."backups"."situacao" = 'falhou') = ("operacao"."backups"."erro" is not null)),
	CONSTRAINT "backups_erro_curto" CHECK ("operacao"."backups"."erro" is null or length("operacao"."backups"."erro") between 1 and 2000),
	CONSTRAINT "backups_tamanho_valido" CHECK ("operacao"."backups"."tamanho" is null or "operacao"."backups"."tamanho" >= 0),
	CONSTRAINT "backups_destinos_validos" CHECK (jsonb_typeof("operacao"."backups"."destinos") = 'array' and octet_length("operacao"."backups"."destinos"::text) <= 8192),
	CONSTRAINT "backups_pasta_valida" CHECK ("operacao"."backups"."pasta" is null or "operacao"."backups"."pasta" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{4}Z$'),
	CONSTRAINT "backups_manifesto_valido" CHECK ("operacao"."backups"."manifesto" is null or jsonb_typeof("operacao"."backups"."manifesto") = 'object'),
	CONSTRAINT "backups_removido_terminado" CHECK ("operacao"."backups"."removido_em" is null or "operacao"."backups"."situacao" <> 'em-andamento')
);
--> statement-breakpoint
CREATE TABLE "operacao"."testes_de_restauracao" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"iniciado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"terminado_em" timestamp with time zone,
	"backup_id" uuid,
	"situacao" text DEFAULT 'em-andamento' NOT NULL,
	"erro" text,
	"detalhes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "testes_de_restauracao_situacao_valida" CHECK ("operacao"."testes_de_restauracao"."situacao" in ('em-andamento', 'feito', 'falhou')),
	CONSTRAINT "testes_de_restauracao_fim_com_a_situacao" CHECK (("operacao"."testes_de_restauracao"."situacao" = 'em-andamento') = ("operacao"."testes_de_restauracao"."terminado_em" is null)),
	CONSTRAINT "testes_de_restauracao_erro_so_na_falha" CHECK (("operacao"."testes_de_restauracao"."situacao" = 'falhou') = ("operacao"."testes_de_restauracao"."erro" is not null)),
	CONSTRAINT "testes_de_restauracao_erro_curto" CHECK ("operacao"."testes_de_restauracao"."erro" is null or length("operacao"."testes_de_restauracao"."erro") between 1 and 2000),
	CONSTRAINT "testes_de_restauracao_detalhes_validos" CHECK (jsonb_typeof("operacao"."testes_de_restauracao"."detalhes") = 'object' and octet_length("operacao"."testes_de_restauracao"."detalhes"::text) <= 8192)
);
--> statement-breakpoint
ALTER TABLE "operacao"."testes_de_restauracao" ADD CONSTRAINT "testes_de_restauracao_backup_id_backups_id_fk" FOREIGN KEY ("backup_id") REFERENCES "operacao"."backups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backups_lista_idx" ON "operacao"."backups" USING btree ("iniciado_em" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "backups_um_em_andamento" ON "operacao"."backups" USING btree ("situacao") WHERE "operacao"."backups"."situacao" = 'em-andamento';--> statement-breakpoint
CREATE INDEX "testes_de_restauracao_lista_idx" ON "operacao"."testes_de_restauracao" USING btree ("iniciado_em" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "testes_de_restauracao_um_em_andamento" ON "operacao"."testes_de_restauracao" USING btree ("situacao") WHERE "operacao"."testes_de_restauracao"."situacao" = 'em-andamento';
--> statement-breakpoint
-- A agenda começa com o backup às 02:00 e o teste de restauração no domingo.
INSERT INTO "operacao"."agenda" DEFAULT VALUES;
--> statement-breakpoint
-- O papel da aplicação lê e grava os registros, sem mudar a estrutura do esquema nem apagar a
-- agenda (spec isolamento-organizacoes).
GRANT USAGE ON SCHEMA operacao TO grafite_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON operacao.backups, operacao.testes_de_restauracao TO grafite_app;
--> statement-breakpoint
GRANT SELECT, UPDATE ON operacao.agenda TO grafite_app;
