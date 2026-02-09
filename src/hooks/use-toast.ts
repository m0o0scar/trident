"use client"

import * as React from "react"

import type { ToastActionElement, ToastProps } from "@/components/ui/toast"

const TOAST_LIMIT = 1
const TOAST_REMOVE_DELAY = 1000000

// Helper to copy text to clipboard
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textArea);
    }
  }
}

type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const

let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type ActionType = typeof actionTypes

type Action =
  | {
      type: ActionType["ADD_TOAST"]
      toast: ToasterToast
    }
  | {
      type: ActionType["UPDATE_TOAST"]
      toast: Partial<ToasterToast>
    }
  | {
      type: ActionType["DISMISS_TOAST"]
      toastId?: ToasterToast["id"]
    }
  | {
      type: ActionType["REMOVE_TOAST"]
      toastId?: ToasterToast["id"]
    }

interface State {
  toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    })
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }

    case "DISMISS_TOAST": {
      const { toastId } = action

      if (toastId) {
        addToRemoveQueue(toastId)
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id)
        })
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      }
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

const listeners: Array<(state: State) => void> = []

let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

type Toast = Omit<ToasterToast, "id">

function toast({ ...props }: Toast) {
  const id = genId()

  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    })
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open: boolean) => {
        if (!open) dismiss()
      },
    },
  })

  return {
    id: id,
    dismiss,
    update,
  }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [state])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  }
}

// Git error toast helper - shows a destructive toast with copy button
interface GitErrorToastOptions {
  title?: string;
  operation?: string;
}

function showGitErrorToast(error: Error | string, options: GitErrorToastOptions = {}) {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const title = options.title || (options.operation ? `${options.operation} Failed` : 'Git Operation Failed');
  
  const id = genId();
  
  // Create a stateful component for the copy button
  const CopyableErrorDescription = () => {
    const [copied, setCopied] = React.useState(false);
    
    const handleCopy = async (e: React.MouseEvent) => {
      e.stopPropagation();
      const success = await copyToClipboard(errorMessage);
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    };
    
    // Container
    return React.createElement('div', { 
      className: 'mt-2 space-y-3' 
    },
      // Error message box
      React.createElement('div', { 
        className: 'max-h-[120px] overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed bg-black/20 p-3 rounded-md break-words text-red-100 border border-red-900/30' 
      }, errorMessage),
      // Copy button
      React.createElement('button', {
        onClick: handleCopy,
        type: 'button',
        className: `inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-all cursor-pointer ${
          copied 
            ? 'bg-green-600 text-white' 
            : 'bg-white/10 hover:bg-white/20 text-red-100 border border-red-200/20'
        }`,
      }, 
        // Icon
        copied 
          ? React.createElement('svg', { 
              className: 'w-3.5 h-3.5', 
              fill: 'none', 
              viewBox: '0 0 24 24', 
              stroke: 'currentColor',
              strokeWidth: 2
            }, React.createElement('path', { 
              strokeLinecap: 'round', 
              strokeLinejoin: 'round', 
              d: 'M5 13l4 4L19 7' 
            }))
          : React.createElement('svg', { 
              className: 'w-3.5 h-3.5', 
              fill: 'none', 
              viewBox: '0 0 24 24', 
              stroke: 'currentColor',
              strokeWidth: 2
            }, React.createElement('path', { 
              strokeLinecap: 'round', 
              strokeLinejoin: 'round', 
              d: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z' 
            })),
        copied ? 'Copied!' : 'Copy Error'
      )
    );
  };
  
  dispatch({
    type: "ADD_TOAST",
    toast: {
      id,
      variant: "destructive",
      title,
      description: React.createElement(CopyableErrorDescription),
      open: true,
      onOpenChange: (open: boolean) => {
        if (!open) {
          dispatch({ type: "DISMISS_TOAST", toastId: id });
        }
      },
    },
  });
  
  return {
    id,
    dismiss: () => dispatch({ type: "DISMISS_TOAST", toastId: id }),
  };
}

export { useToast, toast, showGitErrorToast }
