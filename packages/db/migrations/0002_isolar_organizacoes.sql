-- A raiz dos dados também é isolada: cada organização só enxerga a si mesma.
ALTER TABLE organizacoes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE organizacoes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY isolamento_por_organizacao ON organizacoes
  USING (id = app.current_org())
  WITH CHECK (id = app.current_org());
