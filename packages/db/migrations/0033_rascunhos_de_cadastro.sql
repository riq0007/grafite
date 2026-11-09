-- Os rascunhos dos cadastros (change cadastro-em-etapas, design, decisão 6): um por conta e por
-- cadastro em cada organização, hoje só o do ativo, com o conteúdo objeto até 256 KB e o índice da
-- manutenção diária, que apaga o parado há mais de 30 dias; isolados pela organização.
CREATE TABLE "rascunhos_de_cadastro" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"cadastro" text NOT NULL,
	"conteudo" jsonb NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rascunhos_de_cadastro_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "rascunhos_de_cadastro_unico" UNIQUE("org_id","conta_id","cadastro"),
	CONSTRAINT "rascunhos_de_cadastro_cadastro_valido" CHECK ("rascunhos_de_cadastro"."cadastro" in ('ativo')),
	CONSTRAINT "rascunhos_de_cadastro_conteudo_valido" CHECK (jsonb_typeof("rascunhos_de_cadastro"."conteudo") = 'object' and octet_length("rascunhos_de_cadastro"."conteudo"::text) <= 262144)
);
--> statement-breakpoint
ALTER TABLE "rascunhos_de_cadastro" ADD CONSTRAINT "rascunhos_de_cadastro_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rascunhos_de_cadastro" ADD CONSTRAINT "rascunhos_de_cadastro_conta_fk" FOREIGN KEY ("org_id","conta_id") REFERENCES "public"."contas"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rascunhos_de_cadastro_atualizado_em_idx" ON "rascunhos_de_cadastro" USING btree ("org_id","atualizado_em");--> statement-breakpoint
SELECT app.isolar_por_organizacao('rascunhos_de_cadastro');
