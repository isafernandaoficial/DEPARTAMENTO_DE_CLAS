# Clã Virtuosas

Sistema interno para acompanhar as membras do Clã, organizar os cafés online e sugerir encontros por proximidade (cidade e estado).

## Telas

- `/painel` — visão geral com números principais e membros recentes
- `/membros` — lista completa, com busca
- `/membros/:id` — perfil individual (cadastro, campo restrito ao núcleo, histórico de cafés)
- `/entrada` — formulário de boas vindas para novas membras
- `/cafes` — lista de cafés online agendados e realizados

## Como rodar localmente

```bash
npm install
cp .env.example .env
# preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env
npm run dev
```

## Banco de dados

O schema completo está em `supabase/schema.sql`. Depois de criar o projeto no Supabase:

1. Abra o SQL Editor do projeto
2. Cole e rode o conteúdo de `supabase/schema.sql`
3. Em Authentication > Users, crie os três acessos (Isa, Aline, Charlane)
4. Rode o insert de exemplo no final do arquivo SQL para ligar cada uma ao papel certo (`nucleo` para Isa e Aline, `lideranca` para Charlane)

O schema já cria três tabelas com controle de acesso por linha (RLS):

- `membros`: dados de cadastro e gestão. Núcleo edita, liderança só visualiza
- `membros_caminhada`: campo sensível ("como ela está nessa fase"), tabela separada, acesso exclusivo do núcleo. A liderança não consegue nem ler
- `cafes_online`: histórico de cafés, um registro por café. Núcleo edita, liderança só visualiza

O formulário público de entrada (`/entrada`) grava direto nessas tabelas sem exigir login, usando uma policy própria que só permite inserir, nunca ler os dados de outras membras.

## Publicar no GitHub Pages

O repositório já vem com um workflow pronto em `.github/workflows/deploy.yml`. Depois de subir o código:

1. No GitHub, vá em Settings > Secrets and variables > Actions, e crie dois secrets: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, com os valores do seu projeto Supabase
2. Vá em Settings > Pages, e em "Build and deployment", troque a fonte (Source) para **GitHub Actions**
3. Faça um push na branch `main` (ou rode o workflow manualmente em Actions), e o site publica sozinho

O `vite.config.js` já está configurado com o caminho `/cla-virtuosas/`, do jeito que o GitHub Pages espera para um repositório com esse nome. Se você criar o repositório com outro nome, ajuste o valor de `repoName` nesse arquivo e o `basename` do `BrowserRouter` em `src/main.jsx` para o mesmo nome.

## Próximos passos

1. Configurar sincronização com o Google Sheets existente
2. Configurar autenticação para o núcleo e para a liderança
