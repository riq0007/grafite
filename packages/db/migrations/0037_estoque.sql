-- O estoque dos consumíveis (spec estoque; change p4c-estoque, design, decisão 2): o livro-razão,
-- com as checagens de cada tipo e só de inclusão para o papel da aplicação, e o saldo de cada
-- consumível em cada local, nunca negativo, com o mínimo e o momento em que ficou abaixo dele,
-- isolados pela organização.
CREATE TABLE "movimentos_do_estoque" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"consumivel_id" uuid NOT NULL,
	"quantidade" integer NOT NULL,
	"origem_id" uuid,
	"destino_id" uuid,
	"fornecedor_id" uuid,
	"nota_fiscal" text,
	"ativo_id" uuid,
	"contador_paginas" bigint,
	"contador_lido_em" timestamp with time zone,
	"motivo" text,
	"observacao" text,
	"lancado_por" uuid NOT NULL,
	"momento" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movimentos_do_estoque_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "movimentos_do_estoque_tipo_valido" CHECK ("movimentos_do_estoque"."tipo" in ('entrada', 'saida', 'transferencia', 'ajuste')),
	CONSTRAINT "movimentos_do_estoque_quantidade_valida" CHECK ("movimentos_do_estoque"."quantidade" between 1 and 100000),
	CONSTRAINT "movimentos_do_estoque_nota_valida" CHECK ("movimentos_do_estoque"."nota_fiscal" is null or length(trim("movimentos_do_estoque"."nota_fiscal")) between 1 and 40),
	CONSTRAINT "movimentos_do_estoque_observacao_valida" CHECK ("movimentos_do_estoque"."observacao" is null or length(trim("movimentos_do_estoque"."observacao")) between 1 and 200),
	CONSTRAINT "movimentos_do_estoque_motivo_valido" CHECK ("movimentos_do_estoque"."motivo" is null or "movimentos_do_estoque"."motivo" in ('inventario', 'perda', 'avaria', 'devolucao-ao-fornecedor', 'outro')),
	CONSTRAINT "movimentos_do_estoque_contador_valido" CHECK (("movimentos_do_estoque"."contador_paginas" is null) = ("movimentos_do_estoque"."contador_lido_em" is null)
        and ("movimentos_do_estoque"."contador_paginas" is null or "movimentos_do_estoque"."contador_paginas" >= 0)),
	CONSTRAINT "movimentos_do_estoque_campos_do_tipo" CHECK (("movimentos_do_estoque"."tipo" <> 'entrada' or ("movimentos_do_estoque"."origem_id" is null and "movimentos_do_estoque"."destino_id" is not null
          and "movimentos_do_estoque"."fornecedor_id" is not null and "movimentos_do_estoque"."nota_fiscal" is not null and "movimentos_do_estoque"."ativo_id" is null
          and "movimentos_do_estoque"."contador_paginas" is null and "movimentos_do_estoque"."motivo" is null))
        and ("movimentos_do_estoque"."tipo" <> 'saida' or ("movimentos_do_estoque"."origem_id" is not null and "movimentos_do_estoque"."destino_id" is null
          and "movimentos_do_estoque"."fornecedor_id" is null and "movimentos_do_estoque"."nota_fiscal" is null and "movimentos_do_estoque"."ativo_id" is not null
          and "movimentos_do_estoque"."motivo" is null))
        and ("movimentos_do_estoque"."tipo" <> 'transferencia' or ("movimentos_do_estoque"."origem_id" is not null and "movimentos_do_estoque"."destino_id" is not null
          and "movimentos_do_estoque"."origem_id" <> "movimentos_do_estoque"."destino_id" and "movimentos_do_estoque"."fornecedor_id" is null and "movimentos_do_estoque"."nota_fiscal" is null
          and "movimentos_do_estoque"."ativo_id" is null and "movimentos_do_estoque"."contador_paginas" is null and "movimentos_do_estoque"."motivo" is null))
        and ("movimentos_do_estoque"."tipo" <> 'ajuste' or (num_nonnulls("movimentos_do_estoque"."origem_id", "movimentos_do_estoque"."destino_id") = 1
          and "movimentos_do_estoque"."fornecedor_id" is null and "movimentos_do_estoque"."nota_fiscal" is null and "movimentos_do_estoque"."ativo_id" is null
          and "movimentos_do_estoque"."contador_paginas" is null and "movimentos_do_estoque"."motivo" is not null))),
	CONSTRAINT "movimentos_do_estoque_outro_com_observacao" CHECK ("movimentos_do_estoque"."motivo" is distinct from 'outro' or "movimentos_do_estoque"."observacao" is not null)
);
--> statement-breakpoint
CREATE TABLE "saldos_do_estoque" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"consumivel_id" uuid NOT NULL,
	"local_id" uuid NOT NULL,
	"saldo" integer DEFAULT 0 NOT NULL,
	"minimo" integer DEFAULT 0 NOT NULL,
	"abaixo_desde" timestamp with time zone,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saldos_do_estoque_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "saldos_do_estoque_par_unico" UNIQUE("org_id","consumivel_id","local_id"),
	CONSTRAINT "saldos_do_estoque_saldo_valido" CHECK ("saldos_do_estoque"."saldo" >= 0),
	CONSTRAINT "saldos_do_estoque_minimo_valido" CHECK ("saldos_do_estoque"."minimo" between 0 and 100000),
	CONSTRAINT "saldos_do_estoque_abaixo_do_minimo_coerente" CHECK (("saldos_do_estoque"."abaixo_desde" is not null) = ("saldos_do_estoque"."minimo" > 0 and "saldos_do_estoque"."saldo" < "saldos_do_estoque"."minimo"))
);
--> statement-breakpoint
ALTER TABLE "movimentos_do_estoque" ADD CONSTRAINT "movimentos_do_estoque_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentos_do_estoque" ADD CONSTRAINT "movimentos_do_estoque_consumivel_fk" FOREIGN KEY ("org_id","consumivel_id") REFERENCES "public"."consumiveis"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentos_do_estoque" ADD CONSTRAINT "movimentos_do_estoque_origem_fk" FOREIGN KEY ("org_id","origem_id") REFERENCES "public"."locais"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentos_do_estoque" ADD CONSTRAINT "movimentos_do_estoque_destino_fk" FOREIGN KEY ("org_id","destino_id") REFERENCES "public"."locais"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentos_do_estoque" ADD CONSTRAINT "movimentos_do_estoque_fornecedor_fk" FOREIGN KEY ("org_id","fornecedor_id") REFERENCES "public"."fornecedores"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentos_do_estoque" ADD CONSTRAINT "movimentos_do_estoque_ativo_fk" FOREIGN KEY ("org_id","ativo_id") REFERENCES "public"."ativos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentos_do_estoque" ADD CONSTRAINT "movimentos_do_estoque_lancado_por_fk" FOREIGN KEY ("org_id","lancado_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saldos_do_estoque" ADD CONSTRAINT "saldos_do_estoque_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saldos_do_estoque" ADD CONSTRAINT "saldos_do_estoque_consumivel_fk" FOREIGN KEY ("org_id","consumivel_id") REFERENCES "public"."consumiveis"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saldos_do_estoque" ADD CONSTRAINT "saldos_do_estoque_local_fk" FOREIGN KEY ("org_id","local_id") REFERENCES "public"."locais"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movimentos_do_estoque_momento_idx" ON "movimentos_do_estoque" USING btree ("org_id","momento" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "movimentos_do_estoque_consumivel_idx" ON "movimentos_do_estoque" USING btree ("org_id","consumivel_id","momento" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "movimentos_do_estoque_origem_idx" ON "movimentos_do_estoque" USING btree ("org_id","origem_id","momento" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "movimentos_do_estoque"."origem_id" is not null;--> statement-breakpoint
CREATE INDEX "movimentos_do_estoque_destino_idx" ON "movimentos_do_estoque" USING btree ("org_id","destino_id","momento" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "movimentos_do_estoque"."destino_id" is not null;--> statement-breakpoint
CREATE INDEX "movimentos_do_estoque_fornecedor_idx" ON "movimentos_do_estoque" USING btree ("org_id","fornecedor_id","momento" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "movimentos_do_estoque"."fornecedor_id" is not null;--> statement-breakpoint
CREATE INDEX "movimentos_do_estoque_ativo_idx" ON "movimentos_do_estoque" USING btree ("org_id","ativo_id","momento" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "movimentos_do_estoque"."ativo_id" is not null;--> statement-breakpoint
CREATE INDEX "saldos_do_estoque_abaixo_idx" ON "saldos_do_estoque" USING btree ("org_id","abaixo_desde","id") WHERE "saldos_do_estoque"."abaixo_desde" is not null;--> statement-breakpoint
SELECT app.isolar_por_organizacao('movimentos_do_estoque');--> statement-breakpoint
SELECT app.isolar_por_organizacao('saldos_do_estoque');--> statement-breakpoint
-- Só inclusão (spec estoque, "Movimentação lançada"): o papel da aplicação inclui e lê o
-- livro-razão, e nunca altera nem apaga.
REVOKE UPDATE, DELETE ON movimentos_do_estoque FROM grafite_app;