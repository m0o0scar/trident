# 🔱 Trident

A modern, web-based Git client built with Next.js. Manage your repositories, view commit history with a visual graph, and perform common Git operations through an intuitive interface.

![](./docs/poster.jpeg)

## Features

- **Repository Management** - Add and manage multiple local Git repositories
- **Visual Commit Graph** - Fork-style commit visualization with branch lanes
- **Branch Operations** - Create, checkout, delete, rename, rebase, and merge branches
- **Change Staging** - Stage/unstage files individually or all at once
- **Diff Viewer** - Syntax-highlighted diff view for reviewing changes
- **Commit History** - Browse commit history with infinite scroll and branch filtering
- **Dark/Light Mode** - Theme toggle for comfortable viewing

## Feature Roadmap

### Repository Management
- [x] Open local repository
- [x] List recent repositories
- [ ] Clone repository
- [ ] Initialize new repository

### Working Directory & Staging
- [x] View modified files status
- [x] Stage/Unstage individual files
- [x] Stage All files
- [ ] Discard changes (Clean)
- [ ] Stash changes
- [ ] Pop/Apply stash

### Committing
- [x] Write commit message
- [x] Create commit
- [ ] Amend last commit
- [ ] Sign commits (GPG/SSH)
- [ ] Co-author support

### Branching & Merging
- [x] List local and remote branches
- [x] Create branch
- [x] Checkout branch
- [x] Delete branch
- [x] Rename branch
- [x] Merge (Squash, Fast-forward options)
- [x] Rebase (with auto-stash support)

### Remote Operations
- [x] List remotes
- [x] Fetch (All or specific remote)
- [x] Pull (Rebase support)
- [x] Push (Force push, Set Upstream)
- [ ] Manage Remotes (Add/Edit/Remove)

### History & Graph
- [x] Visual commit graph (Lanes, Merges)
- [x] Filter history by branch visibility
- [x] View commit details (Message, Author, Date)
- [x] View commit diffs (Side-by-side / Inline)

### Advanced / Other
- [ ] Cherry-pick commits
- [ ] Revert commits
- [ ] Tags management
- [ ] Submodules support
- [ ] Interactive Rebase
- [ ] Blame/Annotate view
- [ ] Git LFS support
- [ ] Diff syntax highlighting

## Tech Stack

- **Framework:** [Next.js](https://nextjs.org/) 16 (App Router)
- **Language:** TypeScript
- **UI Components:** [Radix UI](https://www.radix-ui.com/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/) 4
- **State Management:** [TanStack Query](https://tanstack.com/query)
- **Git Operations:** [simple-git](https://github.com/steveukx/git-js)
- **Diff Rendering:** [react-diff-viewer](https://github.com/praneshr/react-diff-viewer)
- **Theming:** [next-themes](https://github.com/pacocoursey/next-themes)
- **Validation:** [Zod](https://zod.dev/)

## Getting Started

### Prerequisites

- Node.js 18+
- Git installed and available in PATH

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd trident

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm start
```

## Usage

1. **Add a Repository** - Click "Add Repository" on the home page and browse to select a local Git repository
2. **View Changes** - The workspace view shows staged and unstaged changes with diff previews
3. **Commit Changes** - Stage files and enter a commit message (Cmd/Ctrl+Enter to commit)
4. **Browse History** - Navigate to the History tab to view the commit graph
5. **Manage Branches** - Use the branch sidebar to switch, create, or manage branches

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes for Git operations
│   │   ├── git/           # Git action endpoints
│   │   ├── fs/            # File system endpoints
│   │   └── repos/         # Repository management
│   └── workspace/         # Workspace pages (status, history, settings)
├── components/            # React components
│   ├── git/              # Git-specific components
│   │   ├── diff-view.tsx
│   │   ├── git-graph.tsx
│   │   ├── history-view.tsx
│   │   └── status-view.tsx
│   ├── layout/           # Layout components
│   └── ui/               # Reusable UI components (Radix-based)
├── hooks/                # Custom React hooks
├── lib/                  # Utilities and services
│   ├── git.ts           # Git service wrapper
│   ├── graph-utils.ts   # Commit graph algorithms
│   ├── store.ts         # State management
│   └── types.ts         # TypeScript definitions
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

## License

MIT
