CREATE TABLE "plantas" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"nome_normalizado" text NOT NULL,
	"local_id" uuid,
	"modelo" text,
	"largura" double precision,
	"profundidade" double precision,
	"contagens" jsonb,
	"situacao" text NOT NULL,
	"erro" text,
	"fonte" text NOT NULL,
	"criada_por" uuid,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plantas_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "plantas_situacao_valida" CHECK ("plantas"."situacao" in ('convertendo', 'ativa', 'falhou', 'inativa')),
	CONSTRAINT "plantas_nome_valido" CHECK (length(trim("plantas"."nome")) between 1 and 80),
	CONSTRAINT "plantas_textos_validos" CHECK (("plantas"."erro" is null or length(trim("plantas"."erro")) between 1 and 1000) and ("plantas"."fonte" is null or length(trim("plantas"."fonte")) between 1 and 200))
);
--> statement-breakpoint
CREATE TABLE "posicoes_na_planta" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"planta_id" uuid NOT NULL,
	"alvo_tipo" text NOT NULL,
	"alvo_id" uuid NOT NULL,
	"x" double precision NOT NULL,
	"z" double precision NOT NULL,
	"mudada_por" uuid,
	"mudada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posicoes_na_planta_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "posicoes_na_planta_alvo_unico" UNIQUE("org_id","planta_id","alvo_tipo","alvo_id"),
	CONSTRAINT "posicoes_na_planta_alvo_valido" CHECK ("posicoes_na_planta"."alvo_tipo" ~ '^[a-z][a-z-]{1,39}$'),
	CONSTRAINT "posicoes_na_planta_ponto_valido" CHECK ("posicoes_na_planta"."x" between -100000 and 100000 and "posicoes_na_planta"."z" between -100000 and 100000)
);
--> statement-breakpoint
ALTER TABLE "plantas" ADD CONSTRAINT "plantas_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plantas" ADD CONSTRAINT "plantas_local_fk" FOREIGN KEY ("org_id","local_id") REFERENCES "public"."locais"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plantas" ADD CONSTRAINT "plantas_criada_por_fk" FOREIGN KEY ("org_id","criada_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posicoes_na_planta" ADD CONSTRAINT "posicoes_na_planta_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posicoes_na_planta" ADD CONSTRAINT "posicoes_na_planta_planta_fk" FOREIGN KEY ("org_id","planta_id") REFERENCES "public"."plantas"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posicoes_na_planta" ADD CONSTRAINT "posicoes_na_planta_mudada_por_fk" FOREIGN KEY ("org_id","mudada_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plantas_nome_idx" ON "plantas" USING btree ("org_id","nome_normalizado");--> statement-breakpoint
CREATE INDEX "posicoes_na_planta_alvo_idx" ON "posicoes_na_planta" USING btree ("org_id","alvo_tipo","alvo_id");--> statement-breakpoint
SELECT app.isolar_por_organizacao('plantas');--> statement-breakpoint
SELECT app.isolar_por_organizacao('posicoes_na_planta');