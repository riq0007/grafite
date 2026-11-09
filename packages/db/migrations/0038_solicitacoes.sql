-- As solicitações à TI (spec solicitacoes; change p4d-solicitacoes, design, decisão 2): a
-- solicitação, com as checagens de cada tipo e que o papel da aplicação não apaga; as impressoras
-- do toner, com o contador congelado; os itens, que o item entregue trava; e a numeração por
-- organização. Todas isoladas pela organização.
CREATE TABLE "impressoras_das_solicitacoes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"solicitacao_id" uuid NOT NULL,
	"ativo_id" uuid NOT NULL,
	"contador_paginas" bigint,
	"contador_lido_em" timestamp with time zone,
	"incluida_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "impressoras_das_solicitacoes_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "impressoras_das_solicitacoes_unica" UNIQUE("org_id","solicitacao_id","ativo_id"),
	CONSTRAINT "impressoras_das_solicitacoes_contador_valido" CHECK (("impressoras_das_solicitacoes"."contador_paginas" is null) = ("impressoras_das_solicitacoes"."contador_lido_em" is null)
        and ("impressoras_das_solicitacoes"."contador_paginas" is null or "impressoras_das_solicitacoes"."contador_paginas" >= 0))
);
--> statement-breakpoint
CREATE TABLE "itens_das_solicitacoes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"solicitacao_id" uuid NOT NULL,
	"impressora_id" uuid NOT NULL,
	"cor" text NOT NULL,
	"quantidade" integer NOT NULL,
	"consumivel_id" uuid,
	"origem" text,
	"movimento_id" uuid,
	"fornecedor_id" uuid,
	"entregue_por" uuid,
	"entregue_em" timestamp with time zone,
	CONSTRAINT "itens_das_solicitacoes_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "itens_das_solicitacoes_cor_unica" UNIQUE("org_id","solicitacao_id","impressora_id","cor"),
	CONSTRAINT "itens_das_solicitacoes_cor_valida" CHECK ("itens_das_solicitacoes"."cor" in ('preto', 'ciano', 'magenta', 'amarelo', 'colorido')),
	CONSTRAINT "itens_das_solicitacoes_quantidade_valida" CHECK ("itens_das_solicitacoes"."quantidade" between 1 and 99),
	CONSTRAINT "itens_das_solicitacoes_entrega_coerente" CHECK (("itens_das_solicitacoes"."origem" is null) = ("itens_das_solicitacoes"."entregue_em" is null)
        and ("itens_das_solicitacoes"."entregue_em" is null) = ("itens_das_solicitacoes"."entregue_por" is null)
        and ("itens_das_solicitacoes"."origem" is not null or ("itens_das_solicitacoes"."movimento_id" is null and "itens_das_solicitacoes"."fornecedor_id" is null))
        and ("itens_das_solicitacoes"."origem" is distinct from 'estoque' or ("itens_das_solicitacoes"."movimento_id" is not null
          and "itens_das_solicitacoes"."consumivel_id" is not null and "itens_das_solicitacoes"."fornecedor_id" is null))
        and ("itens_das_solicitacoes"."origem" is distinct from 'fornecedor' or ("itens_das_solicitacoes"."fornecedor_id" is not null
          and "itens_das_solicitacoes"."movimento_id" is null)))
);
--> statement-breakpoint
CREATE TABLE "numeracao_das_solicitacoes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"ultimo" integer NOT NULL,
	CONSTRAINT "numeracao_das_solicitacoes_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "numeracao_das_solicitacoes_org_unica" UNIQUE("org_id"),
	CONSTRAINT "numeracao_das_solicitacoes_ultimo_valido" CHECK ("numeracao_das_solicitacoes"."ultimo" >= 1)
);
--> statement-breakpoint
CREATE TABLE "solicitacoes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"tipo" text NOT NULL,
	"situacao" text NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"observacao" text,
	"ativo_id" uuid,
	"defeito" text,
	"tipo_de_ativo_id" uuid,
	"quantidade" integer,
	"motivo" text,
	"local_id" uuid,
	"fornecedor_id" uuid,
	"os_do_fornecedor" text,
	"o_que_foi_feito" text,
	"motivo_do_cancelamento" text,
	"locais" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"sem_local" boolean DEFAULT false NOT NULL,
	"registrada_por" uuid NOT NULL,
	"registrada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"encerrada_por" uuid,
	"encerrada_em" timestamp with time zone,
	CONSTRAINT "solicitacoes_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "solicitacoes_numero_unico" UNIQUE("org_id","numero"),
	CONSTRAINT "solicitacoes_tipo_valido" CHECK ("solicitacoes"."tipo" in ('toner', 'conserto', 'equipamento')),
	CONSTRAINT "solicitacoes_situacao_valida" CHECK ("solicitacoes"."situacao" in ('aberta', 'em-atendimento', 'aguardando-entrega', 'concluida', 'cancelada')),
	CONSTRAINT "solicitacoes_quantidade_valida" CHECK ("solicitacoes"."quantidade" is null or "solicitacoes"."quantidade" between 1 and 99),
	CONSTRAINT "solicitacoes_textos_validos" CHECK (("solicitacoes"."observacao" is null or length(trim("solicitacoes"."observacao")) between 1 and 500) and ("solicitacoes"."defeito" is null or length(trim("solicitacoes"."defeito")) between 1 and 1000)
        and ("solicitacoes"."motivo" is null or length(trim("solicitacoes"."motivo")) between 1 and 1000) and ("solicitacoes"."os_do_fornecedor" is null or length(trim("solicitacoes"."os_do_fornecedor")) between 1 and 40)
        and ("solicitacoes"."o_que_foi_feito" is null or length(trim("solicitacoes"."o_que_foi_feito")) between 1 and 1000) and ("solicitacoes"."motivo_do_cancelamento" is null or length(trim("solicitacoes"."motivo_do_cancelamento")) between 1 and 200)),
	CONSTRAINT "solicitacoes_campos_do_tipo" CHECK (("solicitacoes"."tipo" <> 'toner' or ("solicitacoes"."ativo_id" is null and "solicitacoes"."defeito" is null
          and "solicitacoes"."tipo_de_ativo_id" is null and "solicitacoes"."quantidade" is null and "solicitacoes"."motivo" is null
          and "solicitacoes"."local_id" is null))
        and ("solicitacoes"."tipo" <> 'conserto' or ("solicitacoes"."ativo_id" is not null and "solicitacoes"."defeito" is not null
          and "solicitacoes"."tipo_de_ativo_id" is null and "solicitacoes"."quantidade" is null and "solicitacoes"."motivo" is null
          and "solicitacoes"."local_id" is null and "solicitacoes"."fornecedor_id" is null
          and "solicitacoes"."situacao" <> 'aguardando-entrega'))
        and ("solicitacoes"."tipo" <> 'equipamento' or ("solicitacoes"."tipo_de_ativo_id" is not null
          and "solicitacoes"."quantidade" is not null and "solicitacoes"."motivo" is not null and "solicitacoes"."local_id" is not null
          and "solicitacoes"."ativo_id" is null and "solicitacoes"."defeito" is null))
        and ("solicitacoes"."os_do_fornecedor" is null or "solicitacoes"."fornecedor_id" is not null)),
	CONSTRAINT "solicitacoes_encerramento_coerente" CHECK (("solicitacoes"."situacao" in ('concluida', 'cancelada')) = ("solicitacoes"."encerrada_em" is not null)
        and ("solicitacoes"."encerrada_em" is null) = ("solicitacoes"."encerrada_por" is null)
        and ("solicitacoes"."situacao" = 'cancelada') = ("solicitacoes"."motivo_do_cancelamento" is not null)
        and ("solicitacoes"."o_que_foi_feito" is null or "solicitacoes"."situacao" = 'concluida'))
);
--> statement-breakpoint
ALTER TABLE "impressoras_das_solicitacoes" ADD CONSTRAINT "impressoras_das_solicitacoes_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impressoras_das_solicitacoes" ADD CONSTRAINT "impressoras_das_solicitacoes_solicitacao_fk" FOREIGN KEY ("org_id","solicitacao_id") REFERENCES "public"."solicitacoes"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impressoras_das_solicitacoes" ADD CONSTRAINT "impressoras_das_solicitacoes_ativo_fk" FOREIGN KEY ("org_id","ativo_id") REFERENCES "public"."ativos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_das_solicitacoes" ADD CONSTRAINT "itens_das_solicitacoes_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_das_solicitacoes" ADD CONSTRAINT "itens_das_solicitacoes_impressora_fk" FOREIGN KEY ("org_id","solicitacao_id","impressora_id") REFERENCES "public"."impressoras_das_solicitacoes"("org_id","solicitacao_id","ativo_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_das_solicitacoes" ADD CONSTRAINT "itens_das_solicitacoes_consumivel_fk" FOREIGN KEY ("org_id","consumivel_id") REFERENCES "public"."consumiveis"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_das_solicitacoes" ADD CONSTRAINT "itens_das_solicitacoes_movimento_fk" FOREIGN KEY ("org_id","movimento_id") REFERENCES "public"."movimentos_do_estoque"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_das_solicitacoes" ADD CONSTRAINT "itens_das_solicitacoes_fornecedor_fk" FOREIGN KEY ("org_id","fornecedor_id") REFERENCES "public"."fornecedores"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_das_solicitacoes" ADD CONSTRAINT "itens_das_solicitacoes_entregue_por_fk" FOREIGN KEY ("org_id","entregue_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numeracao_das_solicitacoes" ADD CONSTRAINT "numeracao_das_solicitacoes_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_pessoa_fk" FOREIGN KEY ("org_id","pessoa_id") REFERENCES "public"."pessoas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_ativo_fk" FOREIGN KEY ("org_id","ativo_id") REFERENCES "public"."ativos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_tipo_de_ativo_fk" FOREIGN KEY ("org_id","tipo_de_ativo_id") REFERENCES "public"."tipos_de_ativo"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_local_fk" FOREIGN KEY ("org_id","local_id") REFERENCES "public"."locais"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_fornecedor_fk" FOREIGN KEY ("org_id","fornecedor_id") REFERENCES "public"."fornecedores"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_registrada_por_fk" FOREIGN KEY ("org_id","registrada_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_encerrada_por_fk" FOREIGN KEY ("org_id","encerrada_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "impressoras_das_solicitacoes_ativo_idx" ON "impressoras_das_solicitacoes" USING btree ("org_id","ativo_id");--> statement-breakpoint
CREATE INDEX "itens_das_solicitacoes_solicitacao_idx" ON "itens_das_solicitacoes" USING btree ("org_id","solicitacao_id");--> statement-breakpoint
CREATE INDEX "solicitacoes_registrada_idx" ON "solicitacoes" USING btree ("org_id","registrada_em" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "solicitacoes_situacao_idx" ON "solicitacoes" USING btree ("org_id","situacao","registrada_em" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "solicitacoes_ativo_idx" ON "solicitacoes" USING btree ("org_id","ativo_id") WHERE "solicitacoes"."ativo_id" is not null;--> statement-breakpoint
CREATE INDEX "solicitacoes_locais_idx" ON "solicitacoes" USING gin ("locais");--> statement-breakpoint
SELECT app.isolar_por_organizacao('solicitacoes');--> statement-breakpoint
SELECT app.isolar_por_organizacao('impressoras_das_solicitacoes');--> statement-breakpoint
SELECT app.isolar_por_organizacao('itens_das_solicitacoes');--> statement-breakpoint
SELECT app.isolar_por_organizacao('numeracao_das_solicitacoes');--> statement-breakpoint
-- Nada se apaga (spec solicitacoes, "Solicitação não se apaga"): o papel da aplicação inclui,
-- lê e altera a solicitação, e nunca a apaga; a que não vai ser atendida é cancelada.
REVOKE DELETE ON solicitacoes FROM grafite_app;--> statement-breakpoint
-- O item entregue não muda nem sai (spec solicitacoes, "Entrega do toner"): a entrega é a
-- última mudança dele, e o consumível errado se corrige no estoque, por um ajuste.
CREATE FUNCTION app.recusar_mudanca_do_item_entregue() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'O item entregue não muda nem sai da solicitação.'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER itens_das_solicitacoes_entregue_trava
  BEFORE UPDATE OR DELETE ON itens_das_solicitacoes
  FOR EACH ROW WHEN (OLD.entregue_em IS NOT NULL)
  EXECUTE FUNCTION app.recusar_mudanca_do_item_entregue();
