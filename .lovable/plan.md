## Resumo

Transformar `/dashboard` em um painel da paróquia com 4 cards: **Totais**, **Top 5 presentes**, **Top 5 faltosos** e **Próximos encontros**, com **filtro por mês/ano** — tudo agregado no frontend usando as rotas que já existem.

> Resposta direta: **não precisa criar nova rota agora**. As rotas atuais bastam. Se a paróquia crescer (muitas turmas × muitos encontros) e o painel ficar lento, vale criar `GET /dashboard/parish/:parishId/summary?from=&to=` no backend depois.

## Dados usados (rotas existentes)

- `GET /classes/parish/:parishId` → turmas da paróquia
- `GET /students/:classId` → alunos por turma
- `GET /lectures/:classId` → encontros por turma (campo `date`)
- `GET /attendances/lecture/:lectureId` → presenças do encontro
- `GET /absences/lecture/:lectureId` → faltas do encontro

## Algoritmo de agregação (no frontend)

```text
1. Buscar turmas da paróquia do user logado
2. Para cada turma → buscar lectures e students (em paralelo via React Query)
3. Filtrar lectures pelo mês/ano selecionado
4. Para cada lecture filtrada → buscar attendances + absences (em paralelo)
5. Acumular por studentId: { presentes, faltas }
6. Derivar:
   - Totais: nº turmas, nº alunos, nº encontros no mês, % presença média
   - Top 5 presentes: ordenar desc por presentes
   - Top 5 faltosos: ordenar desc por faltas
   - Próximos encontros: lectures com date >= hoje, ordenadas, top 5
```

Cada GET vira uma `useQuery` com chave própria → cache automático, sem refazer requests ao trocar de mês se os dados já estão em memória.

## UI

- Header com seletor de mês (componente `<input type="month">` ou `Popover` + `Calendar` shadcn).
- Grid responsivo:
  - **Totais** (4 mini-cards: Turmas / Alunos / Encontros do mês / % Presença)
  - **Top 5 presentes** (lista com nome + turma + contagem + badge verde)
  - **Top 5 faltosos** (lista com nome + turma + contagem + badge vermelho)
  - **Próximos encontros** (lista com tema, turma, data formatada, link para a chamada)
- Skeletons enquanto carrega; estado vazio amigável; toast de erro se algum GET falhar.

## Arquivos

- **Edita** `src/routes/_authenticated.dashboard.tsx` — substitui conteúdo atual pelo painel.
- **Cria** `src/lib/dashboard-aggregations.ts` — funções puras: `aggregateAttendance`, `topN`, `filterByMonth`. Facilita teste e mantém a rota enxuta.
- **(Opcional)** `src/components/dashboard/MonthPicker.tsx` se o seletor crescer.

## Observação sobre performance

Com N turmas e M encontros no mês, o frontend faz ~ `N + N + 2·(N·M)` requests. Para uma paróquia com 5 turmas × 4 encontros/mês = ~50 requests — aceitável e paralelizado pelo React Query. Acima disso, recomendo migrar para uma rota agregada no backend.
