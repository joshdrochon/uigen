# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server with Turbopack
npm run build        # Production build (includes Node compatibility layer)
npm run start        # Run production build
npm lint             # ESLint via Next.js config
npm test             # Run Vitest suite
npm run setup        # Install deps + generate Prisma + run migrations
npm run db:reset     # Force-reset Prisma migrations
```

Run a single test file: `npx vitest run src/path/to/__tests__/file.test.ts`

## Environment

Copy `.env.example` to `.env`. Set `ANTHROPIC_API_KEY` for real AI responses — the app falls back to a mock provider (`src/lib/provider.ts`) if the key is absent.

## Architecture

UIGen is a Next.js 15 App Router app where users describe React components in chat and Claude generates them with live preview.

### Core Data Flow

1. User sends a message via `ChatInterface` → `POST /api/chat/route.ts`
2. The API streams `streamText` responses (Vercel AI SDK) using Claude (or mock) with two tools:
   - `str_replace_editor` — create/view/edit files via `str-replace.ts`
   - `file_manager` — rename/delete files via `file-manager.ts`
3. Tool calls mutate the **VirtualFileSystem** (in-memory, never written to disk)
4. `PreviewFrame` watches the file system, builds a browser import map (local files → blob URLs, npm packages → esm.sh CDN), and re-renders the component in a sandboxed iframe
5. For authenticated users, the entire file system + chat history is serialized to JSON and persisted to SQLite via Prisma

### Virtual File System (`src/lib/file-system.ts`)

All files live in a `VirtualFileSystem` class — a Map-based in-memory tree. State is shared application-wide via `FileSystemContext` (`src/lib/contexts/file-system-context.tsx`). On project load the serialized JSON is deserialized back into this class.

### Preview Rendering (`src/components/preview/PreviewFrame.tsx`)

Reads all VFS files, calls `createImportMap()` (`src/lib/transform/jsx-transformer.ts`) which Babel-transforms JSX to JS and maps imports, then injects everything into a sandboxed iframe with React 19 from esm.sh.

### Authentication

JWT sessions via `jose` (`src/lib/auth.ts`), bcrypt passwords, SQLite database. Server actions in `src/actions/`. Middleware at `src/middleware.ts` protects the `/api/chat` route. Anonymous users can still use the app; their work is tracked in localStorage (`src/lib/anon-work-tracker.ts`).

### AI Provider Abstraction (`src/lib/provider.ts`)

Wraps `@ai-sdk/anthropic`. Returns a mock streaming provider when `ANTHROPIC_API_KEY` is not set, enabling development without API costs.

### System Prompt (`src/lib/prompts/generation.tsx`)

Defines the rules Claude follows when generating components — read this before modifying AI behavior.

### Database

Prisma + SQLite. Schema: `User` (id, email, password) ↔ `Project` (id, name, userId, messages JSON, data JSON). Run `npx prisma studio` to inspect data locally.

## Code Style

Use comments sparingly. Only comment complex code.

When creating a new component, write a colocated unit test in a `__tests__/` directory alongside it (e.g. `src/components/foo/__tests__/Foo.test.tsx`). Follow existing patterns: Vitest + `@testing-library/react` + `@testing-library/user-event`, mock child components/contexts with `vi.mock()`, use `render()` for components and `renderHook()` for hooks, `beforeEach(() => vi.clearAllMocks())` + `afterEach(() => cleanup())`.

### Key Libraries

| Purpose | Library |
|---------|---------|
| AI streaming | Vercel AI SDK (`ai`) + `@ai-sdk/anthropic` |
| Code editor | `@monaco-editor/react` |
| JSX transform | `@babel/standalone` |
| Auth tokens | `jose` |
| UI components | shadcn/ui (Radix primitives, Tailwind v4) |
| Layout | `react-resizable-panels` |
| Testing | Vitest + Testing Library |
