-- Questionário Minha Caminhada no Clã
-- Público só insere; leitura apenas pelo painel do Supabase (Table Editor).

create table if not exists public.pesquisa_clas_respostas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  versao text not null default 'v1',
  cla text not null check (char_length(cla) between 1 and 120),
  funcao text check (char_length(funcao) <= 60),
  tempo_cla text check (char_length(tempo_cla) <= 60),
  frequencia text check (char_length(frequencia) <= 60),
  contato_semana text check (char_length(contato_semana) <= 60),
  contato_falta text check (char_length(contato_falta) <= 60),
  pontualidade text check (char_length(pontualidade) <= 60),
  acolhimento smallint check (acolhimento between 1 and 5),
  ajuda text[] check (cardinality(ajuda) <= 10),
  dificuldades text[] check (cardinality(dificuldades) <= 10),
  convidaria text check (char_length(convidaria) <= 60),
  vida_deus text check (char_length(vida_deus) <= 60),
  estudo text check (char_length(estudo) <= 60),
  serve text check (char_length(serve) <= 60),
  preparar text check (char_length(preparar) <= 60),
  horas_servir text check (char_length(horas_servir) <= 60),
  rotina text[] check (cardinality(rotina) <= 10),
  necessidades text[] check (cardinality(necessidades) <= 10),
  animo_servir smallint check (animo_servir between 1 and 5),
  mensagem text check (char_length(mensagem) <= 2000),
  quer_cafe boolean not null default false,
  nome text check (char_length(nome) <= 120),
  whatsapp text check (char_length(whatsapp) <= 30)
);

alter table public.pesquisa_clas_respostas enable row level security;

create policy "publico_envia_resposta"
  on public.pesquisa_clas_respostas
  for insert
  to anon, authenticated
  with check (true);

-- Sem policy de select, update ou delete: pelo site ninguém lê, altera ou apaga respostas.
