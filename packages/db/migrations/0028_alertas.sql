-- Os alertas (change p3a-regras-e-alertas, design, decisão 3): as regras de alerta da organização,
-- com a chave da regra de fábrica; os alertas de um ativo ou de um coletor, com o índice único
-- parcial que nunca deixa dois iguais não resolvidos; e o silêncio dos alertas de um ativo.
CREATE TABLE "alertas" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"regra_id" uuid NOT NULL,
	"ativo_id" uuid,
	"coletor_id" uuid,
	"item" text DEFAULT '' NOT NULL,
	"situacao" text NOT NULL,
	"severidade" text NOT NULL,
	"texto" text NOT NULL,
	"observado_em" timestamp with time zone NOT NULL,
	"aberto_em" timestamp with time zone,
	"resolvido_em" timestamp with time zone,
	"como_terminou" text,
	"reconhecido_por" uuid,
	"reconhecido_em" timestamp with time zone,
	"adiado_ate" timestamp with time zone,
	"adiado_por" uuid,
	"aberto_no_silencio" boolean DEFAULT false NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alertas_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "alertas_um_alvo" CHECK (num_nonnulls("alertas"."ativo_id", "alertas"."coletor_id") = 1),
	CONSTRAINT "alertas_item_valido" CHECK (length("alertas"."item") <= 60),
	CONSTRAINT "alertas_situacao_valida" CHECK ("alertas"."situacao" in ('pendente', 'aberto', 'resolvido')),
	CONSTRAINT "alertas_severidade_valida" CHECK ("alertas"."severidade" in ('critico', 'atencao', 'info')),
	CONSTRAINT "alertas_texto_valido" CHECK (length("alertas"."texto") between 1 and 200),
	CONSTRAINT "alertas_aberto_com_a_abertura" CHECK (("alertas"."situacao" = 'pendente') = ("alertas"."aberto_em" is null)),
	CONSTRAINT "alertas_resolvido_com_o_fim" CHECK (("alertas"."situacao" = 'resolvido') = ("alertas"."resolvido_em" is not null)
        and ("alertas"."situacao" = 'resolvido') = ("alertas"."como_terminou" is not null)),
	CONSTRAINT "alertas_fim_valido" CHECK ("alertas"."como_terminou" is null or "alertas"."como_terminou" in ('voltou-ao-normal', 'regra-deixou-de-valer')),
	CONSTRAINT "alertas_reconhecimento_completo" CHECK (("alertas"."reconhecido_por" is null) = ("alertas"."reconhecido_em" is null)),
	CONSTRAINT "alertas_adiamento_completo" CHECK (("alertas"."adiado_ate" is null) = ("alertas"."adiado_por" is null))
);
--> statement-breakpoint
CREATE TABLE "regras_de_alerta" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"nome_normalizado" text NOT NULL,
	"condicao" text NOT NULL,
	"parametros" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"duracao" integer DEFAULT 0 NOT NULL,
	"severidade" text NOT NULL,
	"escopo" text DEFAULT 'organizacao' NOT NULL,
	"escopo_id" uuid,
	"situacao" text DEFAULT 'ativa' NOT NULL,
	"fabrica" text,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regras_de_alerta_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "regras_de_alerta_nome_unico" UNIQUE("org_id","nome_normalizado"),
	CONSTRAINT "regras_de_alerta_fabrica_unica" UNIQUE("org_id","fabrica"),
	CONSTRAINT "regras_de_alerta_nome_valido" CHECK (length(trim("regras_de_alerta"."nome")) between 1 and 80),
	CONSTRAINT "regras_de_alerta_condicao_valida" CHECK ("regras_de_alerta"."condicao" in ('rede.offline', 'toner.nivel', 'impressora.condicao', 'controlid.situacao', 'coleta.atrasada', 'coletor.sem-contato')),
	CONSTRAINT "regras_de_alerta_parametros_validos" CHECK (jsonb_typeof("regras_de_alerta"."parametros") = 'object' and octet_length("regras_de_alerta"."parametros"::text) <= 2048),
	CONSTRAINT "regras_de_alerta_duracao_valida" CHECK ("regras_de_alerta"."duracao" between 0 and 1440),
	CONSTRAINT "regras_de_alerta_severidade_valida" CHECK ("regras_de_alerta"."severidade" in ('critico', 'atencao', 'info')),
	CONSTRAINT "regras_de_alerta_escopo_valido" CHECK ("regras_de_alerta"."escopo" in ('organizacao', 'tipo', 'modelo', 'ativo', 'local')),
	CONSTRAINT "regras_de_alerta_escopo_com_o_registro" CHECK (("regras_de_alerta"."escopo" = 'organizacao') = ("regras_de_alerta"."escopo_id" is null)),
	CONSTRAINT "regras_de_alerta_situacao_valida" CHECK ("regras_de_alerta"."situacao" in ('ativa', 'inativa')),
	CONSTRAINT "regras_de_alerta_fabrica_valida" CHECK ("regras_de_alerta"."fabrica" is null or "regras_de_alerta"."fabrica" ~ '^[a-z0-9-]{1,60}$')
);
--> statement-breakpoint
CREATE TABLE "silencios_dos_ativos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"ativo_id" uuid NOT NULL,
	"ate" timestamp with time zone,
	"motivo" text,
	"criado_por" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "silencios_dos_ativos_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "silencios_dos_ativos_um_por_ativo" UNIQUE("org_id","ativo_id"),
	CONSTRAINT "silencios_dos_ativos_motivo_valido" CHECK ("silencios_dos_ativos"."motivo" is null or length("silencios_dos_ativos"."motivo") between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_regra_fk" FOREIGN KEY ("org_id","regra_id") REFERENCES "public"."regras_de_alerta"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_ativo_fk" FOREIGN KEY ("org_id","ativo_id") REFERENCES "public"."ativos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_coletor_fk" FOREIGN KEY ("org_id","coletor_id") REFERENCES "public"."coletores"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_reconhecido_por_fk" FOREIGN KEY ("org_id","reconhecido_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_adiado_por_fk" FOREIGN KEY ("org_id","adiado_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_de_alerta" ADD CONSTRAINT "regras_de_alerta_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_de_alerta" ADD CONSTRAINT "regras_de_alerta_criado_por_fk" FOREIGN KEY ("org_id","criado_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silencios_dos_ativos" ADD CONSTRAINT "silencios_dos_ativos_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silencios_dos_ativos" ADD CONSTRAINT "silencios_dos_ativos_ativo_fk" FOREIGN KEY ("org_id","ativo_id") REFERENCES "public"."ativos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "silencios_dos_ativos" ADD CONSTRAINT "silencios_dos_ativos_criado_por_fk" FOREIGN KEY ("org_id","criado_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alertas_um_nao_resolvido" ON "alertas" USING btree ("org_id","regra_id",coalesce("ativo_id", "coletor_id"),"item") WHERE "alertas"."situacao" <> 'resolvido';--> statement-breakpoint
CREATE INDEX "alertas_do_ativo_idx" ON "alertas" USING btree ("org_id","ativo_id","situacao");--> statement-breakpoint
CREATE INDEX "alertas_abertos_idx" ON "alertas" USING btree ("org_id","severidade","aberto_em") WHERE "alertas"."situacao" = 'aberto';--> statement-breakpoint
CREATE INDEX "alertas_resolvidos_idx" ON "alertas" USING btree ("org_id","resolvido_em" DESC NULLS LAST) WHERE "alertas"."situacao" = 'resolvido';--> statement-breakpoint
SELECT app.isolar_por_organizacao('regras_de_alerta');--> statement-breakpoint
SELECT app.isolar_por_organizacao('alertas');--> statement-breakpoint
SELECT app.isolar_por_organizacao('silencios_dos_ativos');
