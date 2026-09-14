// 全局状态：React Context + useReducer，持久化到 localStorage（刷新后追溯链不丢）
import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import type { AppState } from "./types";
import { buildDemoState } from "./demo";
import { emptyState } from "./domain";

const STORAGE_KEY = "dental-sterile-trace:v1";

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && Array.isArray(parsed.packages)) return { ...emptyState(), ...parsed };
    }
  } catch {
    // 数据损坏时回退演示数据
  }
  return buildDemoState();
}

type Action =
  | { type: "replace"; state: AppState }
  | { type: "reset-demo" }
  | { type: "clear" };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "replace":
      return action.state;
    case "reset-demo":
      return buildDemoState();
    case "clear":
      return emptyState();
    default:
      return state;
  }
}

interface StoreCtx {
  state: AppState;
  /** 应用一次纯函数变更并落盘 */
  commit: (next: AppState) => void;
  resetDemo: () => void;
  clearAll: () => void;
}

const Ctx = createContext<StoreCtx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 存储不可用时仅内存保留
    }
  }, [state]);

  const value = useMemo<StoreCtx>(
    () => ({
      state,
      commit: (next) => dispatch({ type: "replace", state: next }),
      resetDemo: () => dispatch({ type: "reset-demo" }),
      clearAll: () => dispatch({ type: "clear" }),
    }),
    [state]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

/** 是否为空库（无任何登记数据） */
export function isEmptyState(state: AppState): boolean {
  return state.packages.length === 0 && state.washBatches.length === 0 && state.sterBatches.length === 0 && state.issues.length === 0;
}
