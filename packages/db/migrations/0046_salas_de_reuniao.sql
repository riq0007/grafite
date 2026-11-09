CREATE TABLE "itens_das_salas" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"nome_normalizado" text NOT NULL,
	"descricao" text,
	"situacao" text DEFAULT 'ativo' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "itens_das_salas_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "itens_das_salas_nome_unico" UNIQUE("org_id","nome_normalizado"),
	CONSTRAINT "itens_das_salas_nome_valido" CHECK (length(trim("itens_das_salas"."nome")) between 1 and 80),
	CONSTRAINT "itens_das_salas_descricao_valida" CHECK (("itens_das_salas"."descricao" is null or length(trim("itens_das_salas"."descricao")) between 1 and 200))
);
--> statement-breakpoint
CREATE TABLE "participantes_das_reservas" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"reserva_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"resposta" text DEFAULT 'sem-resposta' NOT NULL,
	"respondido_em" timestamp with time zone,
	CONSTRAINT "participantes_das_reservas_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "participantes_das_reservas_unico" UNIQUE("org_id","reserva_id","conta_id"),
	CONSTRAINT "participantes_das_reservas_resposta_valida" CHECK ("participantes_das_reservas"."resposta" in ('sem-resposta', 'aceitou', 'recusou'))
);
--> statement-breakpoint
CREATE TABLE "reservas_das_salas" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"sala_id" uuid NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fim" timestamp with time zone NOT NULL,
	"assunto" text NOT NULL,
	"comentario" text,
	"situacao" text NOT NULL,
	"itens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pedida_por" uuid NOT NULL,
	"pedida_em" timestamp with time zone DEFAULT now() NOT NULL,
	"decidida_por" uuid,
	"decidida_em" timestamp with time zone,
	"motivo" text,
	CONSTRAINT "reservas_das_salas_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "reservas_das_salas_horario_valido" CHECK ("reservas_das_salas"."fim" > "reservas_das_salas"."inicio"),
	CONSTRAINT "reservas_das_salas_assunto_valido" CHECK (length(trim("reservas_das_salas"."assunto")) between 1 and 120),
	CONSTRAINT "reservas_das_salas_textos_validos" CHECK (("reservas_das_salas"."comentario" is null or length(trim("reservas_das_salas"."comentario")) between 1 and 1000) and ("reservas_das_salas"."motivo" is null or length(trim("reservas_das_salas"."motivo")) between 1 and 300)),
	CONSTRAINT "reservas_das_salas_situacao_valida" CHECK ("reservas_das_salas"."situacao" in ('pendente', 'aprovada', 'recusada', 'cancelada'))
);
--> statement-breakpoint
CREATE TABLE "salas" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"nome_normalizado" text NOT NULL,
	"local_id" uuid,
	"capacidade" integer,
	"recursos" text,
	"situacao" text DEFAULT 'ativo' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salas_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "salas_nome_unico" UNIQUE("org_id","nome_normalizado"),
	CONSTRAINT "salas_nome_valido" CHECK (length(trim("salas"."nome")) between 1 and 80),
	CONSTRAINT "salas_capacidade_valida" CHECK ("salas"."capacidade" is null or "salas"."capacidade" between 1 and 500),
	CONSTRAINT "salas_recursos_validos" CHECK (("salas"."recursos" is null or length(trim("salas"."recursos")) between 1 and 500))
);
--> statement-breakpoint
ALTER TABLE "itens_das_salas" ADD CONSTRAINT "itens_das_salas_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participantes_das_reservas" ADD CONSTRAINT "participantes_das_reservas_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participantes_das_reservas" ADD CONSTRAINT "participantes_das_reservas_reserva_fk" FOREIGN KEY ("org_id","reserva_id") REFERENCES "public"."reservas_das_salas"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participantes_das_reservas" ADD CONSTRAINT "participantes_das_reservas_conta_fk" FOREIGN KEY ("org_id","conta_id") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas_das_salas" ADD CONSTRAINT "reservas_das_salas_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas_das_salas" ADD CONSTRAINT "reservas_das_salas_sala_fk" FOREIGN KEY ("org_id","sala_id") REFERENCES "public"."salas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas_das_salas" ADD CONSTRAINT "reservas_das_salas_pedida_por_fk" FOREIGN KEY ("org_id","pedida_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas_das_salas" ADD CONSTRAINT "reservas_das_salas_decidida_por_fk" FOREIGN KEY ("org_id","decidida_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salas" ADD CONSTRAINT "salas_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salas" ADD CONSTRAINT "salas_local_fk" FOREIGN KEY ("org_id","local_id") REFERENCES "public"."locais"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "participantes_das_reservas_conta_idx" ON "participantes_das_reservas" USING btree ("org_id","conta_id");--> statement-breakpoint
CREATE INDEX "reservas_das_salas_agenda_idx" ON "reservas_das_salas" USING btree ("org_id","sala_id","inicio");--> statement-breakpoint
SELECT app.isolar_por_organizacao('salas');--> statement-breakpoint
SELECT app.isolar_por_organizacao('itens_das_salas');--> statement-breakpoint
SELECT app.isolar_por_organizacao('reservas_das_salas');--> statement-breakpoint
SELECT app.isolar_por_organizacao('participantes_das_reservas');
