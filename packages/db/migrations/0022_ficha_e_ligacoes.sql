-- A ficha e as ligações dos ativos (design do P1d, decisões 2 a 5): a ligação livre, com o par em
-- ordem e único; o nome original dos arquivos dos campos; a imagem própria do ativo; e o índice GIN
-- dos valores, para o lado de lá dos campos do tipo ativo.
CREATE TABLE "ligacoes_de_ativos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"ativo_a" uuid NOT NULL,
	"ativo_b" uuid NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ligacoes_de_ativos_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "ligacoes_de_ativos_par_unico" UNIQUE("org_id","ativo_a","ativo_b"),
	CONSTRAINT "ligacoes_de_ativos_par_em_ordem" CHECK ("ligacoes_de_ativos"."ativo_a" < "ligacoes_de_ativos"."ativo_b")
);
--> statement-breakpoint
ALTER TABLE "arquivos" ADD COLUMN "nome" text;--> statement-breakpoint
ALTER TABLE "ativos" ADD COLUMN "imagem_id" uuid;--> statement-breakpoint
ALTER TABLE "ligacoes_de_ativos" ADD CONSTRAINT "ligacoes_de_ativos_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ligacoes_de_ativos" ADD CONSTRAINT "ligacoes_de_ativos_ativo_a_fk" FOREIGN KEY ("org_id","ativo_a") REFERENCES "public"."ativos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ligacoes_de_ativos" ADD CONSTRAINT "ligacoes_de_ativos_ativo_b_fk" FOREIGN KEY ("org_id","ativo_b") REFERENCES "public"."ativos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ligacoes_de_ativos" ADD CONSTRAINT "ligacoes_de_ativos_criado_por_fk" FOREIGN KEY ("org_id","criado_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ligacoes_de_ativos_ativo_b_idx" ON "ligacoes_de_ativos" USING btree ("org_id","ativo_b");--> statement-breakpoint
ALTER TABLE "ativos" ADD CONSTRAINT "ativos_imagem_fk" FOREIGN KEY ("org_id","imagem_id") REFERENCES "public"."arquivos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ativos_valores_idx" ON "ativos" USING gin ("valores" jsonb_path_ops);--> statement-breakpoint
ALTER TABLE "arquivos" ADD CONSTRAINT "arquivos_nome_valido" CHECK ("arquivos"."nome" is null or length("arquivos"."nome") between 1 and 200);--> statement-breakpoint
-- Isolamento por organização (spec isolamento-organizacoes).
SELECT app.isolar_por_organizacao('ligacoes_de_ativos');
