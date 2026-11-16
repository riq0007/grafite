-- O apoio dos chamados (spec chamados, "Horário da TI" e "Respostas prontas"; spec
-- arquivos-e-imagens, "Anexos dos chamados"; change chamados-da-ti, design, decisões 1 e 10): a
-- numeração, uma linha por organização; as respostas prontas, com o rótulo único sem acento; o
-- horário da TI, opcional, uma linha por organização; e os anexos, que nascem sem dono e passam ao
-- chamado com a mensagem do mesmo chamado ou com o campo, e que o papel da aplicação não apaga.
-- Todas isoladas pela organização.
CREATE TABLE "anexos_dos_chamados" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"arquivo_id" uuid NOT NULL,
	"chamado_id" uuid,
	"mensagem_id" uuid,
	"campo_id" text,
	CONSTRAINT "anexos_dos_chamados_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "anexos_dos_chamados_arquivo_unico" UNIQUE("org_id","arquivo_id"),
	CONSTRAINT "anexos_dos_chamados_dono_valido" CHECK (("anexos_dos_chamados"."chamado_id" is null and "anexos_dos_chamados"."mensagem_id" is null and "anexos_dos_chamados"."campo_id" is null)
        or ("anexos_dos_chamados"."chamado_id" is not null and num_nonnulls("anexos_dos_chamados"."mensagem_id", "anexos_dos_chamados"."campo_id") = 1)),
	CONSTRAINT "anexos_dos_chamados_campo_valido" CHECK ("anexos_dos_chamados"."campo_id" is null or "anexos_dos_chamados"."campo_id" ~ '^[A-Za-z0-9_-]{1,40}$')
);
--> statement-breakpoint
CREATE TABLE "horario_da_ti" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"dias" smallint[] NOT NULL,
	"inicio" smallint NOT NULL,
	"fim" smallint NOT NULL,
	"fuso" text NOT NULL,
	"carga_cheia" smallint NOT NULL,
	CONSTRAINT "horario_da_ti_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "horario_da_ti_org_unica" UNIQUE("org_id"),
	CONSTRAINT "horario_da_ti_dias_validos" CHECK (cardinality("horario_da_ti"."dias") between 1 and 7
        and "horario_da_ti"."dias" <@ '{1,2,3,4,5,6,7}'::smallint[]
        and cardinality(array_positions("horario_da_ti"."dias", 1::smallint)) <= 1 and cardinality(array_positions("horario_da_ti"."dias", 2::smallint)) <= 1 and cardinality(array_positions("horario_da_ti"."dias", 3::smallint)) <= 1 and cardinality(array_positions("horario_da_ti"."dias", 4::smallint)) <= 1 and cardinality(array_positions("horario_da_ti"."dias", 5::smallint)) <= 1 and cardinality(array_positions("horario_da_ti"."dias", 6::smallint)) <= 1 and cardinality(array_positions("horario_da_ti"."dias", 7::smallint)) <= 1),
	CONSTRAINT "horario_da_ti_horas_validas" CHECK ("horario_da_ti"."inicio" >= 0 and "horario_da_ti"."fim" <= 1439 and "horario_da_ti"."inicio" < "horario_da_ti"."fim"),
	CONSTRAINT "horario_da_ti_fuso_valido" CHECK (("horario_da_ti"."fuso" is null or length(trim("horario_da_ti"."fuso")) between 1 and 64)),
	CONSTRAINT "horario_da_ti_carga_cheia_valida" CHECK ("horario_da_ti"."carga_cheia" between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE "numeracao_dos_chamados" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"ultimo" integer NOT NULL,
	CONSTRAINT "numeracao_dos_chamados_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "numeracao_dos_chamados_org_unica" UNIQUE("org_id"),
	CONSTRAINT "numeracao_dos_chamados_ultimo_valido" CHECK ("numeracao_dos_chamados"."ultimo" >= 1)
);
--> statement-breakpoint
CREATE TABLE "respostas_prontas" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"rotulo" text NOT NULL,
	"rotulo_normalizado" text NOT NULL,
	"texto" text NOT NULL,
	"espera_a_resposta" boolean DEFAULT false NOT NULL,
	"tipos" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"ordem" integer NOT NULL,
	CONSTRAINT "respostas_prontas_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "respostas_prontas_rotulo_unico" UNIQUE("org_id","rotulo_normalizado"),
	CONSTRAINT "respostas_prontas_rotulo_valido" CHECK (length(trim("respostas_prontas"."rotulo")) between 1 and 60),
	CONSTRAINT "respostas_prontas_texto_valido" CHECK (length(trim("respostas_prontas"."texto")) between 1 and 2000)
);
--> statement-breakpoint
-- A chave que a anexos_dos_chamados_mensagem_fk usa vem antes dela: o anexo da mensagem é do mesmo
-- chamado.
ALTER TABLE "mensagens_dos_chamados" ADD CONSTRAINT "mensagens_dos_chamados_id_chamado_unico" UNIQUE("org_id","id","chamado_id");--> statement-breakpoint
ALTER TABLE "anexos_dos_chamados" ADD CONSTRAINT "anexos_dos_chamados_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexos_dos_chamados" ADD CONSTRAINT "anexos_dos_chamados_arquivo_fk" FOREIGN KEY ("org_id","arquivo_id") REFERENCES "public"."arquivos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexos_dos_chamados" ADD CONSTRAINT "anexos_dos_chamados_chamado_fk" FOREIGN KEY ("org_id","chamado_id") REFERENCES "public"."chamados"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexos_dos_chamados" ADD CONSTRAINT "anexos_dos_chamados_mensagem_fk" FOREIGN KEY ("org_id","mensagem_id","chamado_id") REFERENCES "public"."mensagens_dos_chamados"("org_id","id","chamado_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horario_da_ti" ADD CONSTRAINT "horario_da_ti_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numeracao_dos_chamados" ADD CONSTRAINT "numeracao_dos_chamados_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "respostas_prontas" ADD CONSTRAINT "respostas_prontas_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anexos_dos_chamados_chamado_idx" ON "anexos_dos_chamados" USING btree ("org_id","chamado_id") WHERE "anexos_dos_chamados"."chamado_id" is not null;--> statement-breakpoint
CREATE INDEX "anexos_dos_chamados_sem_dono_idx" ON "anexos_dos_chamados" USING btree ("org_id","arquivo_id") WHERE "anexos_dos_chamados"."chamado_id" is null;--> statement-breakpoint
SELECT app.isolar_por_organizacao('numeracao_dos_chamados');--> statement-breakpoint
SELECT app.isolar_por_organizacao('respostas_prontas');--> statement-breakpoint
SELECT app.isolar_por_organizacao('horario_da_ti');--> statement-breakpoint
SELECT app.isolar_por_organizacao('anexos_dos_chamados');--> statement-breakpoint
-- O anexo não se apaga (spec arquivos-e-imagens, "Anexos dos chamados"): a linha liga o arquivo ao
-- dono, e o anexo sem dono há mais de 24 h ou que sai de um campo ganha o `removido_em` no arquivo.
REVOKE DELETE ON anexos_dos_chamados FROM grafite_app;