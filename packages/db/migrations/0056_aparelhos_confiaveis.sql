CREATE TABLE "aparelhos_confiaveis" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"dispositivo" text NOT NULL,
	"ip" "inet",
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"usado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aparelhos_confiaveis_token_hash_unico" UNIQUE("token_hash"),
	CONSTRAINT "aparelhos_confiaveis_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "aparelhos_confiaveis_dispositivo_valido" CHECK (length(trim("aparelhos_confiaveis"."dispositivo")) between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "politica_de_entrada" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"dias_de_confianca" integer DEFAULT 30 NOT NULL,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "politica_de_entrada_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "politica_de_entrada_uma_por_organizacao" UNIQUE("org_id"),
	CONSTRAINT "politica_de_entrada_dias_de_confianca_valido" CHECK ("politica_de_entrada"."dias_de_confianca" is null or "politica_de_entrada"."dias_de_confianca" between 0 and 90)
);
--> statement-breakpoint
ALTER TABLE "contas" ADD COLUMN "dias_de_confianca" integer;--> statement-breakpoint
ALTER TABLE "perfis" ADD COLUMN "dias_de_confianca" integer;--> statement-breakpoint
ALTER TABLE "sessoes" ADD COLUMN "aparelho_id" uuid;--> statement-breakpoint
ALTER TABLE "aparelhos_confiaveis" ADD CONSTRAINT "aparelhos_confiaveis_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aparelhos_confiaveis" ADD CONSTRAINT "aparelhos_confiaveis_conta_fk" FOREIGN KEY ("org_id","conta_id") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "politica_de_entrada" ADD CONSTRAINT "politica_de_entrada_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aparelhos_confiaveis_conta_idx" ON "aparelhos_confiaveis" USING btree ("org_id","conta_id");--> statement-breakpoint
ALTER TABLE "contas" ADD CONSTRAINT "contas_dias_de_confianca_valido" CHECK ("contas"."dias_de_confianca" is null or "contas"."dias_de_confianca" between 0 and 90);--> statement-breakpoint
ALTER TABLE "perfis" ADD CONSTRAINT "perfis_dias_de_confianca_valido" CHECK ("perfis"."dias_de_confianca" is null or "perfis"."dias_de_confianca" between 0 and 90);--> statement-breakpoint
SELECT app.isolar_por_organizacao('aparelhos_confiaveis');--> statement-breakpoint
SELECT app.isolar_por_organizacao('politica_de_entrada');