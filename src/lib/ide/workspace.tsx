/**
 * In-IDE virtual filesystem workspace store.
 *
 * Gives the IDE a local, live workspace in addition to the cloud sandbox:
 * agents write file edits straight into these buffers as they stream, the file
 * tree reflects them (with dirty markers and new files), the editor opens real
 * multi-file tabs, and a commit reads exactly these buffers.
 *
 * This is the "IDE interface" layer that Kus Code + agents control.
 */
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** A single file buffer in the IDE workspace. */
export interface IdeFile {
  path: string;
  /** Current (possibly uncommitted) content shown in the editor. */
  content: string;
  /** The last-synced remote content (from GitHub or the last commit). */
  remoteContent: string;
  /** True when the buffer differs from remote (unsaved change). */
  dirty: boolean;
  /** "created" files don't exist on the remote branch yet. */
  kind: "modified" | "created";
}

export interface IdeWorkspace {
  repository: string | null;
  branch: string | null;
  files: Record<string, IdeFile>;
  openFiles: string[];
  activeFile: string | null;
  /** Ordered terminal transcript for the agent/IDE execution. */
  terminalLines: string[];
  /** True while seeding or awaiting a repo. */
  loading: boolean;
  /** Seed the workspace from a repo's GitHub tree. */
  loadRepository: (repository: string, branch: string) => Promise<void>;
  /** Open a file, creating a buffer from content if not present. */
  openFile: (path: string, content?: string) => void;
  /** Set the active (focused) file. */
  setActive: (path: string | null) => void;
  /** Close a file tab. */
  closeFile: (path: string) => void;
  /** Replace a buffer's content, marking it dirty. */
  writeFile: (path: string, content: string) => void;
  /** Create a new buffer (does not exist on remote). */
  createFile: (path: string, content?: string) => void;
  /** Rename a buffer path. */
  renameFile: (from: string, to: string) => void;
  /** Remove a buffer. */
  removeFile: (path: string) => void;
  /** Mark a buffer clean after a successful commit. */
  markClean: (paths: string[]) => void;
  /** Append a terminal line. */
  pushTerminal: (line: string) => void;
  /** Clear buffers that were never committed on close/reload. */
  reset: () => void;
}

const IdeWorkspaceContext = createContext<IdeWorkspace | null>(null);

const storageKeyFor = (repository: string | null, branch: string | null) =>
  `jyinx:ide-workspace:${repository ?? "local"}:${branch ?? "main"}`;

export function IdeWorkspaceProvider({ children }: { children: ReactNode }) {
  const [repository, setRepository] = useState<string | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, IdeFile>>({});
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const repoKey = `${repository ?? "local"}:${branch ?? "main"}`;

  // Persist the workspace per repo (best-effort; skip huge/private-but-fine).
  useEffect(() => {
    if (!repository || !branch || Object.keys(files).length === 0) return;
    try {
      localStorage.setItem(storageKeyFor(repository, branch), JSON.stringify(files));
    } catch {
      /* quota — ignore */
    }
  }, [repository, branch, files]);

  // Restore a previously-saved workspace for the active repo on mount.
  useEffect(() => {
    if (!repository || !branch) return;
    try {
      const raw = localStorage.getItem(storageKeyFor(repository, branch));
      if (raw) setFiles(JSON.parse(raw) as Record<string, IdeFile>);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, branch]);

  const loadRepository = useCallback(async (repo: string, br: string) => {
    setRepository(repo);
    setBranch(br);
    setLoading(true);
    setOpenFiles([]);
    setActiveFile(null);
    setFiles((prev) => {
      try {
        const raw = localStorage.getItem(storageKeyFor(repo, br));
        return raw ? (JSON.parse(raw) as Record<string, IdeFile>) : prev;
      } catch {
        return prev;
      }
    });
    setLoading(false);
  }, []);

  const openFile = useCallback((path: string, content?: string) => {
    setFiles((prev) => {
      if (prev[path]) return prev;
      return {
        ...prev,
        [path]: {
          path,
          content: content ?? "",
          remoteContent: content ?? "",
          dirty: false,
          kind: "modified",
        },
      };
    });
    setOpenFiles((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setActiveFile(path);
  }, []);

  const setActive = useCallback((path: string | null) => setActiveFile(path), []);

  const closeFile = useCallback((path: string) => {
    setOpenFiles((prev) => prev.filter((p) => p !== path));
    setActiveFile((cur) => (cur === path ? null : cur));
  }, []);

  const writeFile = useCallback((path: string, content: string) => {
    setFiles((prev) => {
      const existing = prev[path];
      return {
        ...prev,
        [path]: {
          path,
          content,
          remoteContent: existing?.remoteContent ?? content,
          dirty: existing ? existing.remoteContent !== content : false,
          kind: existing?.kind ?? "modified",
        },
      };
    });
    setOpenFiles((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setActiveFile(path);
  }, []);

  const createFile = useCallback((path: string, content = "") => {
    setFiles((prev) => ({
      ...prev,
      [path]: { path, content, remoteContent: "", dirty: true, kind: "created" },
    }));
    setOpenFiles((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setActiveFile(path);
  }, []);

  const renameFile = useCallback((from: string, to: string) => {
    setFiles((prev) => {
      const file = prev[from];
      if (!file || from === to) return prev;
      const next: Record<string, IdeFile> = { ...prev };
      delete next[from];
      next[to] = { ...file, path: to };
      return next;
    });
    setOpenFiles((prev) =>
      prev.map((p) => (p === from ? to : p)).filter((p, i, arr) => arr.indexOf(p) === i)
    );
    setActiveFile((cur) => (cur === from ? to : cur));
  }, []);

  const removeFile = useCallback((path: string) => {
    setFiles((prev) => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
    setOpenFiles((prev) => prev.filter((p) => p !== path));
    setActiveFile((cur) => (cur === path ? null : cur));
  }, []);

  const markClean = useCallback((paths: string[]) => {
    const set = new Set(paths);
    setFiles((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([path, file]) =>
          set.has(path) ? [path, { ...file, content: file.content, remoteContent: file.content, dirty: false, kind: "modified" }] : [path, file]
        )
      )
    );
  }, []);

  const pushTerminal = useCallback((line: string) => {
    setTerminalLines((prev) => [...prev.slice(-200), line]);
  }, []);

  const reset = useCallback(() => {
    setFiles({});
    setOpenFiles([]);
    setActiveFile(null);
    setTerminalLines([]);
  }, []);

  const value = useMemo<IdeWorkspace>(
    () => ({
      repository,
      branch,
      files,
      openFiles,
      activeFile,
      terminalLines,
      loading,
      loadRepository,
      openFile,
      setActive,
      closeFile,
      writeFile,
      createFile,
      renameFile,
      removeFile,
      markClean,
      pushTerminal,
      reset,
    }),
    [repository, branch, files, openFiles, activeFile, terminalLines, loading, loadRepository, openFile, setActive, closeFile, writeFile, createFile, renameFile, removeFile, markClean, pushTerminal, reset]
  );

  return <IdeWorkspaceContext.Provider value={value}>{children}</IdeWorkspaceContext.Provider>;
}

export function useIdeWorkspace(): IdeWorkspace {
  const value = useContext(IdeWorkspaceContext);
  if (!value) throw new Error("useIdeWorkspace must be used inside IdeWorkspaceProvider");
  return value;
}

/** Convenience: current buffer for the active file, if any. */
export function useActiveBuffer(): IdeFile | null {
  const ws = useIdeWorkspace();
  return ws.activeFile ? ws.files[ws.activeFile] ?? null : null;
}

/** Number of unsaved (dirty) buffers. */
export function useDirtyCount(): number {
  const ws = useIdeWorkspace();
  return Object.values(ws.files).filter((f) => f.dirty).length;
}