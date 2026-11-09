-- As importações de ativos por planilha (design do P1e, decisões 1, 3 e 7): a planilha lida no
-- envio, com as linhas guardadas até a importação terminar, o campo de cada coluna, a situação, o
-- avanço da tarefa e os totais; e as linhas com erro, uma por linha. Cada conta vê só as dela.
CREATE TABLE "erros_da_importacao" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"importacao_id" uuid NOT NULL,
	"linha" integer NOT NULL,
	"mensagens" jsonb NOT NULL,
	CONSTRAINT "erros_da_importacao_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "erros_da_importacao_linha_unica" UNIQUE("org_id","importacao_id","linha"),
	CONSTRAINT "erros_da_importacao_mensagens_validas" CHECK (jsonb_typeof("erros_da_importacao"."mensagens") = 'array')
);
--> statement-breakpoint
CREATE TABLE "importacoes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"criada_por" uuid NOT NULL,
	"tipo_id" uuid NOT NULL,
	"nome_do_arquivo" text NOT NULL,
	"colunas" jsonb NOT NULL,
	"conteudo" jsonb,
	"linhas" integer NOT NULL,
	"mapeamento" jsonb NOT NULL,
	"situacao" text DEFAULT 'rascunho' NOT NULL,
	"processadas" integer DEFAULT 0 NOT NULL,
	"totais" jsonb DEFAULT '{"novos":0,"alterados":0,"semMudanca":0,"comErro":0}'::jsonb NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"aplicada_em" timestamp with time zone,
	"concluida_em" timestamp with time zone,
	CONSTRAINT "importacoes_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "importacoes_situacao_valida" CHECK ("importacoes"."situacao" in ('rascunho', 'na-fila', 'aplicando', 'concluida', 'com-falha', 'descartada')),
	CONSTRAINT "importacoes_sem_conteudo_depois_do_fim" CHECK ("importacoes"."situacao" not in ('concluida', 'descartada') or "importacoes"."conteudo" is null),
	CONSTRAINT "importacoes_linhas_validas" CHECK ("importacoes"."linhas" between 1 and 5000),
	CONSTRAINT "importacoes_processadas_validas" CHECK ("importacoes"."processadas" between 0 and "importacoes"."linhas"),
	CONSTRAINT "importacoes_nome_do_arquivo_valido" CHECK (length("importacoes"."nome_do_arquivo") between 1 and 200),
	CONSTRAINT "importacoes_json_valido" CHECK (jsonb_typeof("importacoes"."colunas") = 'array' and jsonb_typeof("importacoes"."mapeamento") = 'array'
        and ("importacoes"."conteudo" is null or jsonb_typeof("importacoes"."conteudo") = 'array')
        and jsonb_typeof("importacoes"."totais") = 'object')
);
--> statement-breakpoint
ALTER TABLE "erros_da_importacao" ADD CONSTRAINT "erros_da_importacao_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erros_da_importacao" ADD CONSTRAINT "erros_da_importacao_importacao_fk" FOREIGN KEY ("org_id","importacao_id") REFERENCES "public"."importacoes"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_criada_por_fk" FOREIGN KEY ("org_id","criada_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_tipo_fk" FOREIGN KEY ("org_id","tipo_id") REFERENCES "public"."tipos_de_ativo"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "importacoes_da_conta_idx" ON "importacoes" USING btree ("org_id","criada_por","criada_em" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
-- Isolamento por organização (spec isolamento-organizacoes).
SELECT app.isolar_por_organizacao('importacoes');--> statement-breakpoint
SELECT app.isolar_por_organizacao('erros_da_importacao');
