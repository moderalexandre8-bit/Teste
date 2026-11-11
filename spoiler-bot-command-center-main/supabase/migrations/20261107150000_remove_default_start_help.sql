ALTER TABLE public.bots
  ALTER COLUMN start_help_text SET DEFAULT '';

UPDATE public.bots
SET start_help_text = ''
WHERE start_help_text =
  'Para começar, escolha uma opção nos botões abaixo. Envie /planos para consultar as opções, /meusplanos para ver seus acessos e /comprovantes para consultar pagamentos.';
