-- Os chamados (spec tipos-de-chamado e chamados; change chamados-da-ti, design, decisão 1): o tipo,
-- com o nome único sem acento, o prazo, o atendimento e o que acontece depois; o chamado, que o
-- papel da aplicação não apaga, com quem atende e o relógio coerentes com a situação; e a conversa,
-- só de inclusão. Todas isoladas pela organização.
CREATE TABLE "chamados" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"tipo_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"titulo_normalizado" text NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"origem" text NOT NULL,
	"aberto_por" uuid,
	"aberto_em" timestamp with time zone DEFAULT now() NOT NULL,
	"formulario" jsonb NOT NULL,
	"respostas" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ativo_id" uuid,
	"locais" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"sem_local" boolean DEFAULT false NOT NULL,
	"situacao" text NOT NULL,
	"responsavel_id" uuid,
	"responsavel_desde" timestamp with time zone,
	"prazo" jsonb NOT NULL,
	"contado_s" integer DEFAULT 0 NOT NULL,
	"relogio_desde" timestamp with time zone,
	"primeira_resposta_em" timestamp with time zone,
	"estouro_avisado_em" timestamp with time zone,
	"resolvido_em" timestamp with time zone,
	"resolvido_por" uuid,
	"os_id" uuid,
	"solicitacao_id" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "chamados_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "chamados_numero_unico" UNIQUE("org_id","numero"),
	CONSTRAINT "chamados_os_unica" UNIQUE("org_id","os_id"),
	CONSTRAINT "chamados_numero_valido" CHECK ("chamados"."numero" >= 1),
	CONSTRAINT "chamados_titulo_valido" CHECK (length(trim("chamados"."titulo")) between 1 and 120),
	CONSTRAINT "chamados_origem_valida" CHECK ("chamados"."origem" in ('ti')),
	CONSTRAINT "chamados_situacao_valida" CHECK ("chamados"."situacao" in ('triagem', 'em-atendimento', 'aguardando', 'resolvido')),
	CONSTRAINT "chamados_contado_valido" CHECK ("chamados"."contado_s" >= 0),
	CONSTRAINT "chamados_versao_valida" CHECK ("chamados"."versao" >= 1),
	CONSTRAINT "chamados_abertura_coerente" CHECK ("chamados"."origem" <> 'ti' or ("chamados"."aberto_por" is not null and "chamados"."primeira_resposta_em" is not null)),
	CONSTRAINT "chamados_atendimento_coerente" CHECK (("chamados"."responsavel_id" is null) = ("chamados"."responsavel_desde" is null)
        and ("chamados"."situacao" <> 'triagem' or "chamados"."responsavel_id" is null)
        and ("chamados"."situacao" not in ('em-atendimento', 'aguardando') or "chamados"."responsavel_id" is not null)),
	CONSTRAINT "chamados_relogio_coerente" CHECK (("chamados"."situacao" not in ('triagem', 'em-atendimento') or "chamados"."relogio_desde" is not null)
        and ("chamados"."situacao" not in ('aguardando', 'resolvido') or "chamados"."relogio_desde" is null)),
	CONSTRAINT "chamados_resolucao_coerente" CHECK (("chamados"."resolvido_em" is null) = ("chamados"."resolvido_por" is null)
        and ("chamados"."situacao" <> 'resolvido' or "chamados"."resolvido_em" is not null)
        and ("chamados"."situacao" = 'resolvido' or "chamados"."resolvido_em" is null)),
	CONSTRAINT "chamados_formulario_valido" CHECK (jsonb_typeof("chamados"."formulario") = 'object' and octet_length("chamados"."formulario"::text) <= 524288),
	CONSTRAINT "chamados_respostas_validas" CHECK (jsonb_typeof("chamados"."respostas") = 'object' and octet_length("chamados"."respostas"::text) <= 1048576),
	CONSTRAINT "chamados_prazo_valido" CHECK (jsonb_typeof("chamados"."prazo") = 'object' and octet_length("chamados"."prazo"::text) <= 1024)
);
--> statement-breakpoint
CREATE TABLE "mensagens_dos_chamados" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"chamado_id" uuid NOT NULL,
	"especie" text NOT NULL,
	"autor_conta" uuid,
	"autor_pessoa" uuid,
	"texto" text,
	"evento" text,
	"dados" jsonb,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mensagens_dos_chamados_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "mensagens_dos_chamados_especie_valida" CHECK ("mensagens_dos_chamados"."especie" in ('mensagem', 'nota', 'evento')),
	CONSTRAINT "mensagens_dos_chamados_autoria_valida" CHECK (("mensagens_dos_chamados"."especie" <> 'mensagem' or num_nonnulls("mensagens_dos_chamados"."autor_conta", "mensagens_dos_chamados"."autor_pessoa") = 1)
        and ("mensagens_dos_chamados"."especie" <> 'nota' or ("mensagens_dos_chamados"."autor_conta" is not null and "mensagens_dos_chamados"."autor_pessoa" is null))
        and ("mensagens_dos_chamados"."especie" <> 'evento' or ("mensagens_dos_chamados"."autor_conta" is not null and "mensagens_dos_chamados"."autor_pessoa" is null))),
	CONSTRAINT "mensagens_dos_chamados_conteudo_valido" CHECK (("mensagens_dos_chamados"."especie" not in ('mensagem', 'nota') or ("mensagens_dos_chamados"."texto" is not null
          and length(trim("mensagens_dos_chamados"."texto")) between 1 and 4000 and "mensagens_dos_chamados"."evento" is null and "mensagens_dos_chamados"."dados" is null))
        and ("mensagens_dos_chamados"."especie" <> 'evento' or ("mensagens_dos_chamados"."evento" is not null and "mensagens_dos_chamados"."texto" is null))),
	CONSTRAINT "mensagens_dos_chamados_evento_valido" CHECK ("mensagens_dos_chamados"."evento" is null or "mensagens_dos_chamados"."evento" ~ '^[a-z][a-z-]{0,39}$'),
	CONSTRAINT "mensagens_dos_chamados_dados_validos" CHECK ("mensagens_dos_chamados"."dados" is null or (jsonb_typeof("mensagens_dos_chamados"."dados") = 'object' and octet_length("mensagens_dos_chamados"."dados"::text) <= 1048576))
);
--> statement-breakpoint
CREATE TABLE "tipos_de_chamado" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"nome_normalizado" text NOT NULL,
	"icone" text NOT NULL,
	"frase" text,
	"situacao" text NOT NULL,
	"ordem" integer NOT NULL,
	"resposta_valor" integer NOT NULL,
	"resposta_unidade" text NOT NULL,
	"resolucao_valor" integer NOT NULL,
	"resolucao_unidade" text NOT NULL,
	"modo" text NOT NULL,
	"atende_por_padrao" uuid,
	"sem_ninguem" text NOT NULL,
	"pode_virar_os" boolean DEFAULT false NOT NULL,
	"gera_solicitacao" text NOT NULL,
	"tipo_de_ativo_do_equipamento" uuid,
	"pede_o_ativo" boolean DEFAULT false NOT NULL,
	"aparece_para_o_colaborador" boolean DEFAULT true NOT NULL,
	"so_a_ti_abre" boolean DEFAULT false NOT NULL,
	"formulario" jsonb NOT NULL,
	"duplicado_de" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	CONSTRAINT "tipos_de_chamado_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "tipos_de_chamado_nome_unico" UNIQUE("org_id","nome_normalizado"),
	CONSTRAINT "tipos_de_chamado_nome_valido" CHECK (length(trim("tipos_de_chamado"."nome")) between 1 and 40),
	CONSTRAINT "tipos_de_chamado_frase_valida" CHECK (("tipos_de_chamado"."frase" is null and "tipos_de_chamado"."situacao" = 'rascunho')
        or ("tipos_de_chamado"."frase" is not null and length(trim("tipos_de_chamado"."frase")) between 1 and 80)),
	CONSTRAINT "tipos_de_chamado_icone_valido" CHECK ("tipos_de_chamado"."icone" in ('gota', 'notebook', 'impressora', 'cadeado', 'janela', 'globo', 'telefone', 'reticencias', 'setas', 'computador', 'torre', 'fone', 'chave', 'caixa', 'camera', 'wi-fi')),
	CONSTRAINT "tipos_de_chamado_situacao_valida" CHECK ("tipos_de_chamado"."situacao" in ('rascunho', 'em-uso', 'inativo')),
	CONSTRAINT "tipos_de_chamado_prazo_valido" CHECK ("tipos_de_chamado"."resposta_valor" between 1 and 999 and "tipos_de_chamado"."resolucao_valor" between 1 and 999
        and "tipos_de_chamado"."resposta_unidade" in ('min', 'h', 'd')
        and "tipos_de_chamado"."resolucao_unidade" in ('min', 'h', 'd')
        and "tipos_de_chamado"."modo" in ('corridas', 'horario')),
	CONSTRAINT "tipos_de_chamado_atendimento_valido" CHECK ("tipos_de_chamado"."sem_ninguem" in ('triagem', 'fica')
        and ("tipos_de_chamado"."sem_ninguem" <> 'fica' or "tipos_de_chamado"."atende_por_padrao" is not null)),
	CONSTRAINT "tipos_de_chamado_solicitacao_coerente" CHECK ("tipos_de_chamado"."gera_solicitacao" in ('nao', 'toner', 'equipamento')
        and ("tipos_de_chamado"."gera_solicitacao" = 'equipamento') = ("tipos_de_chamado"."tipo_de_ativo_do_equipamento" is not null)
        and ("tipos_de_chamado"."gera_solicitacao" <> 'toner' or "tipos_de_chamado"."pede_o_ativo")),
	CONSTRAINT "tipos_de_chamado_formulario_valido" CHECK (jsonb_typeof("tipos_de_chamado"."formulario") = 'object' and octet_length("tipos_de_chamado"."formulario"::text) <= 524288)
);
--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_tipo_fk" FOREIGN KEY ("org_id","tipo_id") REFERENCES "public"."tipos_de_chamado"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_pessoa_fk" FOREIGN KEY ("org_id","pessoa_id") REFERENCES "public"."pessoas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_aberto_por_fk" FOREIGN KEY ("org_id","aberto_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_ativo_fk" FOREIGN KEY ("org_id","ativo_id") REFERENCES "public"."ativos"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_responsavel_fk" FOREIGN KEY ("org_id","responsavel_id") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_resolvido_por_fk" FOREIGN KEY ("org_id","resolvido_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_os_fk" FOREIGN KEY ("org_id","os_id") REFERENCES "public"."ordens_de_servico"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_solicitacao_fk" FOREIGN KEY ("org_id","solicitacao_id") REFERENCES "public"."solicitacoes"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_dos_chamados" ADD CONSTRAINT "mensagens_dos_chamados_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_dos_chamados" ADD CONSTRAINT "mensagens_dos_chamados_chamado_fk" FOREIGN KEY ("org_id","chamado_id") REFERENCES "public"."chamados"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_dos_chamados" ADD CONSTRAINT "mensagens_dos_chamados_autor_conta_fk" FOREIGN KEY ("org_id","autor_conta") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_dos_chamados" ADD CONSTRAINT "mensagens_dos_chamados_autor_pessoa_fk" FOREIGN KEY ("org_id","autor_pessoa") REFERENCES "public"."pessoas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipos_de_chamado" ADD CONSTRAINT "tipos_de_chamado_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipos_de_chamado" ADD CONSTRAINT "tipos_de_chamado_atende_por_padrao_fk" FOREIGN KEY ("org_id","atende_por_padrao") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipos_de_chamado" ADD CONSTRAINT "tipos_de_chamado_tipo_de_ativo_fk" FOREIGN KEY ("org_id","tipo_de_ativo_do_equipamento") REFERENCES "public"."tipos_de_ativo"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipos_de_chamado" ADD CONSTRAINT "tipos_de_chamado_duplicado_de_fk" FOREIGN KEY ("org_id","duplicado_de") REFERENCES "public"."tipos_de_chamado"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipos_de_chamado" ADD CONSTRAINT "tipos_de_chamado_criado_por_fk" FOREIGN KEY ("org_id","criado_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chamados_situacao_idx" ON "chamados" USING btree ("org_id","situacao");--> statement-breakpoint
CREATE INDEX "chamados_tipo_idx" ON "chamados" USING btree ("org_id","tipo_id","aberto_em");--> statement-breakpoint
CREATE INDEX "chamados_pessoa_idx" ON "chamados" USING btree ("org_id","pessoa_id");--> statement-breakpoint
CREATE INDEX "chamados_ativo_idx" ON "chamados" USING btree ("org_id","ativo_id") WHERE "chamados"."ativo_id" is not null;--> statement-breakpoint
CREATE INDEX "chamados_solicitacao_idx" ON "chamados" USING btree ("org_id","solicitacao_id") WHERE "chamados"."solicitacao_id" is not null;--> statement-breakpoint
CREATE INDEX "chamados_resolvido_idx" ON "chamados" USING btree ("org_id","resolvido_em") WHERE "chamados"."resolvido_em" is not null;--> statement-breakpoint
CREATE INDEX "chamados_locais_idx" ON "chamados" USING gin ("locais");--> statement-breakpoint
CREATE INDEX "mensagens_dos_chamados_chamado_idx" ON "mensagens_dos_chamados" USING btree ("org_id","chamado_id","criada_em");--> statement-breakpoint
SELECT app.isolar_por_organizacao('tipos_de_chamado');--> statement-breakpoint
SELECT app.isolar_por_organizacao('chamados');--> statement-breakpoint
SELECT app.isolar_por_organizacao('mensagens_dos_chamados');--> statement-breakpoint
-- O chamado não se apaga (spec chamados, "Chamado"): o papel da aplicação inclui, lê e altera o
-- chamado, e nunca o apaga; o que não vai ser atendido é resolvido, com o que foi feito.
REVOKE DELETE ON chamados FROM grafite_app;--> statement-breakpoint
-- A conversa só cresce (spec chamados, "Conversa do chamado"): as mensagens e as notas não se
-- editam nem se apagam, e os eventos contam o que aconteceu.
REVOKE UPDATE, DELETE ON mensagens_dos_chamados FROM grafite_app;