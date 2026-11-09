-- As ordens de serviço (spec ordens-de-servico; change p4e-ordens-de-servico, design, decisão 2):
-- a OS, que o papel da aplicação não apaga, com as checagens de cada situação e uma OS por
-- solicitação; o histórico das situações e as peças, só de inclusão; e a numeração por
-- organização, separada da das solicitações. Todas isoladas pela organização. O consumível ganha
-- o tipo Peça.
CREATE TABLE "historico_das_ordens" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"ordem_id" uuid NOT NULL,
	"situacao" text NOT NULL,
	"texto" text,
	"fornecedor_id" uuid,
	"mudada_por" uuid NOT NULL,
	"mudada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "historico_das_ordens_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "historico_das_ordens_situacao_valida" CHECK ("historico_das_ordens"."situacao" in ('aberta', 'em-atendimento', 'aguardando-peca', 'aguardando-fornecedor', 'resolvida', 'encerrada')),
	CONSTRAINT "historico_das_ordens_texto_valido" CHECK (("historico_das_ordens"."texto" is null or length(trim("historico_das_ordens"."texto")) between 1 and 1000)),
	CONSTRAINT "historico_das_ordens_fornecedor_coerente" CHECK (("historico_das_ordens"."situacao" = 'aguardando-fornecedor') = ("historico_das_ordens"."fornecedor_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "numeracao_das_ordens" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"ultimo" integer NOT NULL,
	CONSTRAINT "numeracao_das_ordens_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "numeracao_das_ordens_org_unica" UNIQUE("org_id"),
	CONSTRAINT "numeracao_das_ordens_ultimo_valido" CHECK ("numeracao_das_ordens"."ultimo" >= 1)
);
--> statement-breakpoint
CREATE TABLE "ordens_de_servico" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"ativo_id" uuid NOT NULL,
	"local_id" uuid,
	"solicitacao_id" uuid,
	"problema" text NOT NULL,
	"situacao" text NOT NULL,
	"fornecedor_id" uuid,
	"os_do_fornecedor" text,
	"solucao" text,
	"motivo_do_encerramento" text,
	"aberta_por" uuid NOT NULL,
	"aberta_em" timestamp with time zone DEFAULT now() NOT NULL,
	"resolvida_por" uuid,
	"resolvida_em" timestamp with time zone,
	"encerrada_por" uuid,
	"encerrada_em" timestamp with time zone,
	CONSTRAINT "ordens_de_servico_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "ordens_de_servico_numero_unico" UNIQUE("org_id","numero"),
	CONSTRAINT "ordens_de_servico_solicitacao_unica" UNIQUE("org_id","solicitacao_id"),
	CONSTRAINT "ordens_de_servico_situacao_valida" CHECK ("ordens_de_servico"."situacao" in ('aberta', 'em-atendimento', 'aguardando-peca', 'aguardando-fornecedor', 'resolvida', 'encerrada')),
	CONSTRAINT "ordens_de_servico_textos_validos" CHECK (length(trim("ordens_de_servico"."problema")) between 1 and 1000 and ("ordens_de_servico"."os_do_fornecedor" is null or length(trim("ordens_de_servico"."os_do_fornecedor")) between 1 and 40)
        and ("ordens_de_servico"."solucao" is null or length(trim("ordens_de_servico"."solucao")) between 1 and 1000) and ("ordens_de_servico"."motivo_do_encerramento" is null or length(trim("ordens_de_servico"."motivo_do_encerramento")) between 1 and 200)),
	CONSTRAINT "ordens_de_servico_fornecedor_coerente" CHECK (("ordens_de_servico"."situacao" <> 'aguardando-fornecedor' or "ordens_de_servico"."fornecedor_id" is not null)
        and ("ordens_de_servico"."os_do_fornecedor" is null or "ordens_de_servico"."fornecedor_id" is not null)),
	CONSTRAINT "ordens_de_servico_resolucao_coerente" CHECK (("ordens_de_servico"."resolvida_em" is null) = ("ordens_de_servico"."resolvida_por" is null)
        and ("ordens_de_servico"."resolvida_em" is null) = ("ordens_de_servico"."solucao" is null)
        and ("ordens_de_servico"."situacao" <> 'resolvida' or "ordens_de_servico"."resolvida_em" is not null)
        and ("ordens_de_servico"."situacao" in ('resolvida', 'encerrada') or "ordens_de_servico"."resolvida_em" is null)),
	CONSTRAINT "ordens_de_servico_encerramento_coerente" CHECK (("ordens_de_servico"."situacao" = 'encerrada') = ("ordens_de_servico"."encerrada_em" is not null)
        and ("ordens_de_servico"."encerrada_em" is null) = ("ordens_de_servico"."encerrada_por" is null)
        and ("ordens_de_servico"."motivo_do_encerramento" is null or "ordens_de_servico"."situacao" = 'encerrada')
        and ("ordens_de_servico"."situacao" <> 'encerrada'
          or ("ordens_de_servico"."resolvida_em" is null) = ("ordens_de_servico"."motivo_do_encerramento" is not null)))
);
--> statement-breakpoint
CREATE TABLE "pecas_das_ordens" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"ordem_id" uuid NOT NULL,
	"consumivel_id" uuid NOT NULL,
	"quantidade" integer NOT NULL,
	"local_id" uuid NOT NULL,
	"movimento_id" uuid NOT NULL,
	"lancada_por" uuid NOT NULL,
	"lancada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pecas_das_ordens_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "pecas_das_ordens_movimento_unico" UNIQUE("org_id","movimento_id"),
	CONSTRAINT "pecas_das_ordens_quantidade_valida" CHECK ("pecas_das_ordens"."quantidade" between 1 and 100000)
);
--> statement-breakpoint
ALTER TABLE "consumiveis" DROP CONSTRAINT "consumiveis_tipo_valido";--> statement-breakpoint
ALTER TABLE "historico_das_ordens" ADD CONSTRAINT "historico_das_ordens_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historico_das_ordens" ADD CONSTRAINT "historico_das_ordens_ordem_fk" FOREIGN KEY ("org_id","ordem_id") REFERENCES "public"."ordens_de_servico"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historico_das_ordens" ADD CONSTRAINT "historico_das_ordens_fornecedor_fk" FOREIGN KEY ("org_id","fornecedor_id") REFERENCES "public"."fornecedores"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historico_das_ordens" ADD CONSTRAINT "historico_das_ordens_mudada_por_fk" FOREIGN KEY ("org_id","mudada_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numeracao_das_ordens" ADD CONSTRAINT "numeracao_das_ordens_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_de_servico" ADD CONSTRAINT "ordens_de_servico_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_de_servico" ADD CONSTRAINT "ordens_de_servico_ativo_fk" FOREIGN KEY ("org_id","ativo_id") REFERENCES "public"."ativos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_de_servico" ADD CONSTRAINT "ordens_de_servico_local_fk" FOREIGN KEY ("org_id","local_id") REFERENCES "public"."locais"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_de_servico" ADD CONSTRAINT "ordens_de_servico_solicitacao_fk" FOREIGN KEY ("org_id","solicitacao_id") REFERENCES "public"."solicitacoes"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_de_servico" ADD CONSTRAINT "ordens_de_servico_fornecedor_fk" FOREIGN KEY ("org_id","fornecedor_id") REFERENCES "public"."fornecedores"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_de_servico" ADD CONSTRAINT "ordens_de_servico_aberta_por_fk" FOREIGN KEY ("org_id","aberta_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_de_servico" ADD CONSTRAINT "ordens_de_servico_resolvida_por_fk" FOREIGN KEY ("org_id","resolvida_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_de_servico" ADD CONSTRAINT "ordens_de_servico_encerrada_por_fk" FOREIGN KEY ("org_id","encerrada_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pecas_das_ordens" ADD CONSTRAINT "pecas_das_ordens_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pecas_das_ordens" ADD CONSTRAINT "pecas_das_ordens_ordem_fk" FOREIGN KEY ("org_id","ordem_id") REFERENCES "public"."ordens_de_servico"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pecas_das_ordens" ADD CONSTRAINT "pecas_das_ordens_consumivel_fk" FOREIGN KEY ("org_id","consumivel_id") REFERENCES "public"."consumiveis"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pecas_das_ordens" ADD CONSTRAINT "pecas_das_ordens_local_fk" FOREIGN KEY ("org_id","local_id") REFERENCES "public"."locais"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pecas_das_ordens" ADD CONSTRAINT "pecas_das_ordens_movimento_fk" FOREIGN KEY ("org_id","movimento_id") REFERENCES "public"."movimentos_do_estoque"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pecas_das_ordens" ADD CONSTRAINT "pecas_das_ordens_lancada_por_fk" FOREIGN KEY ("org_id","lancada_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "historico_das_ordens_ordem_idx" ON "historico_das_ordens" USING btree ("org_id","ordem_id","mudada_em");--> statement-breakpoint
CREATE INDEX "ordens_de_servico_aberta_idx" ON "ordens_de_servico" USING btree ("org_id","aberta_em" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ordens_de_servico_situacao_idx" ON "ordens_de_servico" USING btree ("org_id","situacao","aberta_em" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ordens_de_servico_ativo_idx" ON "ordens_de_servico" USING btree ("org_id","ativo_id");--> statement-breakpoint
CREATE INDEX "ordens_de_servico_local_idx" ON "ordens_de_servico" USING btree ("org_id","local_id");--> statement-breakpoint
CREATE INDEX "pecas_das_ordens_ordem_idx" ON "pecas_das_ordens" USING btree ("org_id","ordem_id");--> statement-breakpoint
ALTER TABLE "consumiveis" ADD CONSTRAINT "consumiveis_tipo_valido" CHECK ("consumiveis"."tipo" in ('toner', 'cilindro', 'tinta', 'fita', 'kit-de-manutencao', 'peca', 'outro'));--> statement-breakpoint
SELECT app.isolar_por_organizacao('ordens_de_servico');--> statement-breakpoint
SELECT app.isolar_por_organizacao('historico_das_ordens');--> statement-breakpoint
SELECT app.isolar_por_organizacao('pecas_das_ordens');--> statement-breakpoint
SELECT app.isolar_por_organizacao('numeracao_das_ordens');--> statement-breakpoint
-- Nada se apaga (spec ordens-de-servico, "Situação e histórico da OS"): o papel da aplicação
-- inclui, lê e altera a OS, e nunca a apaga; a aberta por engano se encerra sem resolver.
REVOKE DELETE ON ordens_de_servico FROM grafite_app;--> statement-breakpoint
-- O histórico e as peças só crescem (spec ordens-de-servico, "Peças da OS"): a peça errada se
-- corrige no estoque, por um ajuste.
REVOKE UPDATE, DELETE ON historico_das_ordens FROM grafite_app;--> statement-breakpoint
REVOKE UPDATE, DELETE ON pecas_das_ordens FROM grafite_app;