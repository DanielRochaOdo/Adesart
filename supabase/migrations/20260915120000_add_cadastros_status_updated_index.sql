-- A consulta das abas de cadastro filtra por status e ordena por atualizacao.
-- O indice composto evita varredura e ordenacao da tabela inteira.
CREATE INDEX IF NOT EXISTS cadastros_status_updated_at_idx
  ON public.cadastros (status, updated_at DESC, id DESC);
