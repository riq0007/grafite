-- O perfil Administrador nas organizações que já existem (spec perfis-e-grupos; design do F2b,
-- decisão 8): protegido, com todas as permissões, atribuído para a organização inteira à conta mais
-- antiga (a ativa, se houver) e exigindo os dois passos se essa conta exigia. As organizações novas
-- ganham o perfil pelo comando no servidor.
--
-- Como dona das tabelas, a migration desliga o RLS forçado só durante a semeadura, que precisa ver
-- todas as organizações, e o religa em seguida; o teste-guarda confere o estado final.
ALTER TABLE "organizacoes" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contas" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "perfis" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "atribuicoes" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
INSERT INTO "perfis" ("org_id", "nome", "nome_normalizado", "descricao", "todas_as_permissoes", "protegido", "exige_dois_passos")
SELECT
  o."id",
  'Administrador',
  'administrador',
  'Todas as permissões, inclusive as dos módulos que vierem.',
  true,
  true,
  coalesce(
    (SELECT c."exige_dois_passos" FROM "contas" c
     WHERE c."org_id" = o."id"
     ORDER BY (c."situacao" = 'ativa') DESC, c."criada_em", c."id" LIMIT 1),
    true
  )
FROM "organizacoes" o
WHERE NOT EXISTS (SELECT 1 FROM "perfis" p WHERE p."org_id" = o."id" AND p."protegido");
--> statement-breakpoint
INSERT INTO "atribuicoes" ("org_id", "perfil_id", "conta_id")
SELECT p."org_id", p."id", primeira."id"
FROM "perfis" p
CROSS JOIN LATERAL (
  SELECT c."id" FROM "contas" c
  WHERE c."org_id" = p."org_id"
  ORDER BY (c."situacao" = 'ativa') DESC, c."criada_em", c."id" LIMIT 1
) primeira
WHERE p."protegido"
  AND NOT EXISTS (SELECT 1 FROM "atribuicoes" a WHERE a."org_id" = p."org_id" AND a."perfil_id" = p."id");
--> statement-breakpoint
ALTER TABLE "organizacoes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contas" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "perfis" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "atribuicoes" FORCE ROW LEVEL SECURITY;
