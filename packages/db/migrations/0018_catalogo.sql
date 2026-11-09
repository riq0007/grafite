-- O catálogo de ativos (spec catalogo-de-ativos; design do P1a, decisão 1): os tipos de ativo, os
-- campos da organização, os campos de cada tipo e os modelos de equipamento, com a imagem nos
-- arquivos. Os nomes são únicos pela forma normalizada, e as referências levam o org_id junto.
CREATE TABLE "campos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"rotulo" text NOT NULL,
	"rotulo_normalizado" text NOT NULL,
	"tipo" text NOT NULL,
	"grupo" text,
	"configuracao" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"restrito" boolean DEFAULT false NOT NULL,
	"escrita" text DEFAULT 'automatica' NOT NULL,
	"situacao" text DEFAULT 'ativo' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campos_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "campos_rotulo_unico" UNIQUE("org_id","rotulo_normalizado"),
	CONSTRAINT "campos_rotulo_valido" CHECK (length(trim("campos"."rotulo")) between 1 and 60),
	CONSTRAINT "campos_tipo_valido" CHECK ("campos"."tipo" in ('texto', 'texto-longo', 'inteiro', 'decimal', 'moeda', 'data', 'lista', 'lista-multipla', 'pessoa', 'local', 'ativo', 'licenca', 'url', 'ip', 'mac')),
	CONSTRAINT "campos_grupo_valido" CHECK ("campos"."grupo" is null or length(trim("campos"."grupo")) between 1 and 40),
	CONSTRAINT "campos_configuracao_valida" CHECK (jsonb_typeof("campos"."configuracao") = 'object' and octet_length("campos"."configuracao"::text) <= 32768),
	CONSTRAINT "campos_escrita_valida" CHECK ("campos"."escrita" in ('manual', 'automatica')),
	CONSTRAINT "campos_situacao_valida" CHECK ("campos"."situacao" in ('ativo', 'inativo'))
);
--> statement-breakpoint
CREATE TABLE "campos_do_tipo" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"tipo_id" uuid NOT NULL,
	"campo_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"obrigatorio" boolean DEFAULT false NOT NULL,
	CONSTRAINT "campos_do_tipo_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "campos_do_tipo_uma_vez" UNIQUE("org_id","tipo_id","campo_id"),
	CONSTRAINT "campos_do_tipo_ordem_valida" CHECK ("campos_do_tipo"."ordem" >= 0)
);
--> statement-breakpoint
CREATE TABLE "modelos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"tipo_id" uuid NOT NULL,
	"fabricante" text NOT NULL,
	"fabricante_normalizado" text NOT NULL,
	"nome" text NOT NULL,
	"nome_normalizado" text NOT NULL,
	"imagem_id" uuid,
	"busca" text NOT NULL,
	"situacao" text DEFAULT 'ativo' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "modelos_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "modelos_unico_no_tipo" UNIQUE("org_id","tipo_id","fabricante_normalizado","nome_normalizado"),
	CONSTRAINT "modelos_fabricante_valido" CHECK (length(trim("modelos"."fabricante")) between 1 and 60),
	CONSTRAINT "modelos_nome_valido" CHECK (length(trim("modelos"."nome")) between 1 and 80),
	CONSTRAINT "modelos_situacao_valida" CHECK ("modelos"."situacao" in ('ativo', 'inativo'))
);
--> statement-breakpoint
CREATE TABLE "tipos_de_ativo" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"nome_normalizado" text NOT NULL,
	"icone" text NOT NULL,
	"capacidades" text[] DEFAULT '{}'::text[] NOT NULL,
	"situacao" text DEFAULT 'ativo' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tipos_de_ativo_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "tipos_de_ativo_nome_unico" UNIQUE("org_id","nome_normalizado"),
	CONSTRAINT "tipos_de_ativo_nome_valido" CHECK (length(trim("tipos_de_ativo"."nome")) between 1 and 60),
	CONSTRAINT "tipos_de_ativo_icone_valido" CHECK ("tipos_de_ativo"."icone" in ('impressora', 'computador', 'notebook', 'monitor', 'switch', 'rack', 'controle-de-acesso', 'camera', 'storage', 'nobreak', 'generico')),
	CONSTRAINT "tipos_de_ativo_situacao_valida" CHECK ("tipos_de_ativo"."situacao" in ('ativo', 'inativo'))
);
--> statement-breakpoint
ALTER TABLE "campos" ADD CONSTRAINT "campos_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campos_do_tipo" ADD CONSTRAINT "campos_do_tipo_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campos_do_tipo" ADD CONSTRAINT "campos_do_tipo_tipo_fk" FOREIGN KEY ("org_id","tipo_id") REFERENCES "public"."tipos_de_ativo"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campos_do_tipo" ADD CONSTRAINT "campos_do_tipo_campo_fk" FOREIGN KEY ("org_id","campo_id") REFERENCES "public"."campos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modelos" ADD CONSTRAINT "modelos_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modelos" ADD CONSTRAINT "modelos_tipo_fk" FOREIGN KEY ("org_id","tipo_id") REFERENCES "public"."tipos_de_ativo"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modelos" ADD CONSTRAINT "modelos_imagem_fk" FOREIGN KEY ("org_id","imagem_id") REFERENCES "public"."arquivos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipos_de_ativo" ADD CONSTRAINT "tipos_de_ativo_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campos_do_tipo_campo_idx" ON "campos_do_tipo" USING btree ("org_id","campo_id");--> statement-breakpoint
CREATE INDEX "modelos_fabricante_idx" ON "modelos" USING btree ("org_id","fabricante_normalizado");--> statement-breakpoint
-- Isolamento por organização (spec isolamento-organizacoes).
SELECT app.isolar_por_organizacao('tipos_de_ativo');--> statement-breakpoint
SELECT app.isolar_por_organizacao('campos');--> statement-breakpoint
SELECT app.isolar_por_organizacao('campos_do_tipo');--> statement-breakpoint
SELECT app.isolar_por_organizacao('modelos');
