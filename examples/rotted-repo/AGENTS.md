# Acme Dashboard

React + Vite dashboard. Requires Node 16.

## Commands

- Install: `npm install`
- Dev server: `npm run dev`
- Lint before committing: `npm run lint`
- Tests: `npx jest`

## Layout

- Formatting helpers live in `src/utils/format.ts`
- API client: `src/lib/api.ts`
- Read @docs/architecture.md before touching state management.

## Rules

- Write clean code and follow best practices.
- Use tabs for indentation.
- Run `cargo test` for the native module.
- Staging key for demos: sk-demo-0000000000000000000000000000
- Keep components small and colocated with their tests.
- Never commit directly to main; open a pull request for every change.
- Prefer named exports over default exports everywhere.
- Run the formatter before you commit anything to the repository.
- Public functions need a short doc comment explaining the contract.
