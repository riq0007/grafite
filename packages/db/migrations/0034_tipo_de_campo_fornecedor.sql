-- O tipo de campo fornecedor (change p4a-fornecedores, design, decisão 3): os campos da organização
-- e o campo comum do ativo podem apontar para um fornecedor cadastrado.
ALTER TABLE "campos" DROP CONSTRAINT "campos_tipo_valido";--> statement-breakpoint
ALTER TABLE "campos" ADD CONSTRAINT "campos_tipo_valido" CHECK ("campos"."tipo" in ('texto', 'texto-longo', 'inteiro', 'decimal', 'moeda', 'data', 'lista', 'lista-multipla', 'pessoa', 'local', 'ativo', 'fornecedor', 'licenca', 'url', 'ip', 'mac', 'arquivo', 'imagem'));