-- Painel dos Clãs Online: leitura das respostas só para e-mails liberados.
-- Para liberar alguém, inclua o e-mail (em minúsculas) na tabela painel_acesso pelo Table Editor.

create table if not exists public.painel_acesso (
  email text primary key check (email = lower(email)),
  nome text,
  criado_em timestamptz not null default now()
);
alter table public.painel_acesso enable row level security;

create or replace function public.tem_acesso_painel()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.painel_acesso
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.tem_acesso_painel() from public, anon;
grant execute on function public.tem_acesso_painel() to authenticated;

create policy "lideranca_le_respostas"
  on public.pesquisa_clas_respostas
  for select
  to authenticated
  using (public.tem_acesso_painel());

alter publication supabase_realtime add table public.pesquisa_clas_respostas;
