-- Os fornecedores da organização (spec fornecedores; change p4a-fornecedores, design, decisão 2): o
-- cadastro com o nome normalizado e o CNPJ únicos, isolado pela organização.
CREATE TABLE "fornecedores" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"nome_normalizado" text NOT NULL,
	"cnpj" text,
	"contato" text,
	"email" text,
	"telefone" text,
	"observacoes" text,
	"situacao" text DEFAULT 'ativo' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fornecedores_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "fornecedores_nome_unico" UNIQUE("org_id","nome_normalizado"),
	CONSTRAINT "fornecedores_nome_valido" CHECK (length(trim("fornecedores"."nome")) between 1 and 120),
	CONSTRAINT "fornecedores_cnpj_valido" CHECK ("fornecedores"."cnpj" is null or "fornecedores"."cnpj" ~ '^[0-9A-Z]{12}[0-9]{2}$'),
	CONSTRAINT "fornecedores_textos_validos" CHECK (("fornecedores"."contato" is null or length("fornecedores"."contato") between 1 and 120)
        and ("fornecedores"."email" is null or length("fornecedores"."email") between 3 and 254)
        and ("fornecedores"."telefone" is null or length("fornecedores"."telefone") between 1 and 30)
        and ("fornecedores"."observacoes" is null or length("fornecedores"."observacoes") between 1 and 2000)),
	CONSTRAINT "fornecedores_situacao_valida" CHECK ("fornecedores"."situacao" in ('ativo', 'inativo'))
);
--> statement-breakpoint
ALTER TABLE "fornecedores" ADD CONSTRAINT "fornecedores_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fornecedores_cnpj_unico" ON "fornecedores" USING btree ("org_id","cnpj") WHERE "fornecedores"."cnpj" is not null;--> statement-breakpoint
SELECT app.isolar_por_organizacao('fornecedores');--> statement-breakpoint
-- A troca do fornecedor em texto dos ativos pela referência (spec cadastro-de-ativos, "Fornecedor
-- dos ativos de antes"; change p4a-fornecedores, design, decisão 4). Como dona das tabelas, a
-- migration desliga o RLS forçado só durante a troca, que precisa ver todas as organizações, e o
-- religa em seguida, como a do Administrador. Cada passo procura só o que ainda é texto: rodar de
-- novo não muda nada. O nome normalizado repete o do domínio para as letras latinas acentuadas.
ALTER TABLE "fornecedores" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ativos" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auditoria" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "visoes" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mudancas_das_visoes" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE OR REPLACE FUNCTION pg_temp.nome_do_fornecedor(texto text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$
    SELECT btrim(left(regexp_replace(btrim(texto), '\s+', ' ', 'g'), 120))
  $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION pg_temp.normalizado(texto text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$
    SELECT btrim(regexp_replace(lower(translate(texto,
      'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy')), '\s+', ' ', 'g'))
  $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION pg_temp.texto_do_fornecedor(valores jsonb) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
      WHEN jsonb_typeof(valores -> 'ativo.fornecedor') = 'string'
       AND (valores ->> 'ativo.fornecedor')
           !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN valores ->> 'ativo.fornecedor'
    END
  $$;--> statement-breakpoint
WITH grafias AS (
  SELECT org_id,
         pg_temp.nome_do_fornecedor(pg_temp.texto_do_fornecedor(valores)) AS nome,
         count(*) AS usos,
         min(criado_em) AS primeiro
    FROM ativos
   WHERE btrim(coalesce(pg_temp.texto_do_fornecedor(valores), '')) <> ''
   GROUP BY 1, 2
), escolhidas AS (
  SELECT DISTINCT ON (org_id, pg_temp.normalizado(nome))
         org_id, nome, pg_temp.normalizado(nome) AS normalizado
    FROM grafias
   ORDER BY org_id, pg_temp.normalizado(nome), usos DESC, primeiro ASC
), criados AS (
  INSERT INTO fornecedores (org_id, nome, nome_normalizado)
  SELECT org_id, nome, normalizado FROM escolhidas
  ON CONFLICT (org_id, nome_normalizado) DO NOTHING
  RETURNING org_id, id, nome
)
INSERT INTO auditoria (org_id, acao, ator_tipo, ator_descricao, alvo_tipo, alvo_id, depois, dados)
SELECT org_id, 'fornecedor.criado', 'sistema', 'atualização do Grafite', 'fornecedor', id,
       jsonb_build_object('nome', nome),
       jsonb_build_object('origem', 'Criado a partir do fornecedor dos ativos')
  FROM criados;--> statement-breakpoint
UPDATE ativos AS a
   SET valores = jsonb_set(a.valores, '{ativo.fornecedor}', to_jsonb(f.id::text))
  FROM fornecedores AS f
 WHERE f.org_id = a.org_id
   AND btrim(coalesce(pg_temp.texto_do_fornecedor(a.valores), '')) <> ''
   AND f.nome_normalizado
       = pg_temp.normalizado(pg_temp.nome_do_fornecedor(pg_temp.texto_do_fornecedor(a.valores)));--> statement-breakpoint
UPDATE ativos
   SET valores = valores - 'ativo.fornecedor'
 WHERE pg_temp.texto_do_fornecedor(valores) IS NOT NULL
   AND btrim(pg_temp.texto_do_fornecedor(valores)) = '';--> statement-breakpoint
CREATE OR REPLACE FUNCTION pg_temp.filtros_trocados(org uuid, filtros jsonb) RETURNS jsonb
  LANGUAGE sql STABLE AS $$
    SELECT coalesce(jsonb_agg(novo ORDER BY ordem), '[]'::jsonb)
      FROM (
        SELECT ordem,
               CASE
                 WHEN filtro ->> 'chave' = 'ativo.fornecedor' AND filtro ->> 'operador' = 'contem'
                 THEN (
                   SELECT jsonb_build_object(
                            'chave', 'ativo.fornecedor',
                            'operador', 'qualquer',
                            'valores', jsonb_agg(f.id::text ORDER BY f.nome))
                     FROM fornecedores AS f
                    WHERE f.org_id = org
                      AND position(pg_temp.normalizado(filtro ->> 'texto') in f.nome_normalizado) > 0
                   HAVING count(*) > 0)
                 ELSE filtro
               END AS novo
          FROM jsonb_array_elements(filtros) WITH ORDINALITY AS e(filtro, ordem)
      ) AS t
     WHERE novo IS NOT NULL
  $$;--> statement-breakpoint
UPDATE visoes
   SET definicao = jsonb_set(definicao, '{filtros}', pg_temp.filtros_trocados(org_id, definicao -> 'filtros'))
 WHERE jsonb_typeof(definicao -> 'filtros') = 'array'
   AND EXISTS (
     SELECT 1 FROM jsonb_array_elements(definicao -> 'filtros') AS x(filtro)
      WHERE filtro ->> 'chave' = 'ativo.fornecedor' AND filtro ->> 'operador' = 'contem');--> statement-breakpoint
UPDATE mudancas_das_visoes
   SET definicao = jsonb_set(definicao, '{filtros}', pg_temp.filtros_trocados(org_id, definicao -> 'filtros'))
 WHERE jsonb_typeof(definicao -> 'filtros') = 'array'
   AND EXISTS (
     SELECT 1 FROM jsonb_array_elements(definicao -> 'filtros') AS x(filtro)
      WHERE filtro ->> 'chave' = 'ativo.fornecedor' AND filtro ->> 'operador' = 'contem');--> statement-breakpoint
DROP FUNCTION pg_temp.filtros_trocados(uuid, jsonb);--> statement-breakpoint
DROP FUNCTION pg_temp.texto_do_fornecedor(jsonb);--> statement-breakpoint
DROP FUNCTION pg_temp.normalizado(text);--> statement-breakpoint
DROP FUNCTION pg_temp.nome_do_fornecedor(text);--> statement-breakpoint
ALTER TABLE "fornecedores" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ativos" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auditoria" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "visoes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mudancas_das_visoes" FORCE ROW LEVEL SECURITY;
