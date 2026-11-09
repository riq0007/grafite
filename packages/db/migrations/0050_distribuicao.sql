CREATE TABLE "distribuicoes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"pacote_id" uuid NOT NULL,
	"criada_por" uuid NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "distribuicoes_org_id_id_unico" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "maquinas_das_distribuicoes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"distribuicao_id" uuid NOT NULL,
	"ativo_id" uuid NOT NULL,
	"agente_id" uuid NOT NULL,
	"situacao" text DEFAULT 'aguardando' NOT NULL,
	"etapa" text,
	"log" text[] DEFAULT '{}'::text[] NOT NULL,
	"enviada_em" timestamp with time zone,
	"atualizada_em" timestamp with time zone,
	"terminada_em" timestamp with time zone,
	CONSTRAINT "maquinas_das_distribuicoes_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "maquinas_das_distribuicoes_ativo_unico" UNIQUE("org_id","distribuicao_id","ativo_id"),
	CONSTRAINT "maquinas_das_distribuicoes_situacao_valida" CHECK ("maquinas_das_distribuicoes"."situacao" in ('aguardando', 'em-andamento', 'concluida', 'falhou'))
);
--> statement-breakpoint
CREATE TABLE "pacotes_de_software" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"nome_normalizado" text NOT NULL,
	"versao" text,
	"descricao" text,
	"comando" text NOT NULL,
	"codigos_de_sucesso" jsonb DEFAULT '[0,3010]'::jsonb NOT NULL,
	"nome_do_arquivo" text,
	"tamanho_do_arquivo" bigint,
	"sha512_do_arquivo" text,
	"situacao" text DEFAULT 'ativo' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pacotes_de_software_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "pacotes_de_software_nome_unico" UNIQUE("org_id","nome_normalizado"),
	CONSTRAINT "pacotes_de_software_nome_valido" CHECK (length(trim("pacotes_de_software"."nome")) between 1 and 120),
	CONSTRAINT "pacotes_de_software_comando_valido" CHECK (length(trim("pacotes_de_software"."comando")) between 1 and 2000),
	CONSTRAINT "pacotes_de_software_versao_valida" CHECK (("pacotes_de_software"."versao" is null or length(trim("pacotes_de_software"."versao")) between 1 and 60)),
	CONSTRAINT "pacotes_de_software_descricao_valida" CHECK (("pacotes_de_software"."descricao" is null or length(trim("pacotes_de_software"."descricao")) between 1 and 2000)),
	CONSTRAINT "pacotes_de_software_arquivo_inteiro" CHECK (("pacotes_de_software"."nome_do_arquivo" is null) = ("pacotes_de_software"."sha512_do_arquivo" is null)
        and ("pacotes_de_software"."nome_do_arquivo" is null) = ("pacotes_de_software"."tamanho_do_arquivo" is null)),
	CONSTRAINT "pacotes_de_software_codigos_validos" CHECK (jsonb_typeof("pacotes_de_software"."codigos_de_sucesso") = 'array' and jsonb_array_length("pacotes_de_software"."codigos_de_sucesso") between 1 and 50)
);
--> statement-breakpoint
CREATE TABLE "partes_dos_pacotes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"pacote_id" uuid NOT NULL,
	"indice" integer NOT NULL,
	"sha512" text NOT NULL,
	"tamanho" integer NOT NULL,
	CONSTRAINT "partes_dos_pacotes_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "partes_dos_pacotes_indice_unico" UNIQUE("org_id","pacote_id","indice"),
	CONSTRAINT "partes_dos_pacotes_sha512_valido" CHECK ("partes_dos_pacotes"."sha512" ~ '^[0-9a-f]{128}$')
);
--> statement-breakpoint
ALTER TABLE "distribuicoes" ADD CONSTRAINT "distribuicoes_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribuicoes" ADD CONSTRAINT "distribuicoes_pacote_fk" FOREIGN KEY ("org_id","pacote_id") REFERENCES "public"."pacotes_de_software"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribuicoes" ADD CONSTRAINT "distribuicoes_conta_fk" FOREIGN KEY ("org_id","criada_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maquinas_das_distribuicoes" ADD CONSTRAINT "maquinas_das_distribuicoes_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maquinas_das_distribuicoes" ADD CONSTRAINT "maquinas_das_distribuicoes_distribuicao_fk" FOREIGN KEY ("org_id","distribuicao_id") REFERENCES "public"."distribuicoes"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maquinas_das_distribuicoes" ADD CONSTRAINT "maquinas_das_distribuicoes_ativo_fk" FOREIGN KEY ("org_id","ativo_id") REFERENCES "public"."ativos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maquinas_das_distribuicoes" ADD CONSTRAINT "maquinas_das_distribuicoes_agente_fk" FOREIGN KEY ("org_id","agente_id") REFERENCES "public"."agentes"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacotes_de_software" ADD CONSTRAINT "pacotes_de_software_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partes_dos_pacotes" ADD CONSTRAINT "partes_dos_pacotes_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partes_dos_pacotes" ADD CONSTRAINT "partes_dos_pacotes_pacote_fk" FOREIGN KEY ("org_id","pacote_id") REFERENCES "public"."pacotes_de_software"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "distribuicoes_criada_em_idx" ON "distribuicoes" USING btree ("org_id","criada_em");--> statement-breakpoint
CREATE INDEX "maquinas_das_distribuicoes_agente_idx" ON "maquinas_das_distribuicoes" USING btree ("org_id","agente_id","situacao");--> statement-breakpoint
CREATE INDEX "maquinas_das_distribuicoes_ativo_idx" ON "maquinas_das_distribuicoes" USING btree ("org_id","ativo_id");--> statement-breakpoint
CREATE INDEX "partes_dos_pacotes_sha512_idx" ON "partes_dos_pacotes" USING btree ("org_id","sha512");--> statement-breakpoint
SELECT app.isolar_por_organizacao('pacotes_de_software');--> statement-breakpoint
SELECT app.isolar_por_organizacao('partes_dos_pacotes');--> statement-breakpoint
SELECT app.isolar_por_organizacao('distribuicoes');--> statement-breakpoint
SELECT app.isolar_por_organizacao('maquinas_das_distribuicoes');