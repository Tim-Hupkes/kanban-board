import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

export type Column = 'todo' | 'doing' | 'done'

export interface Task {
  id: string
  title: string
  column: Column
}

interface BoardState {
  tasks: Task[]
  addTask: (title: string) => void
  moveTask: (id: string, column: Column) => void
  deleteTask: (id: string) => void
}

const createTaskId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const createMemoryStorage = (): StateStorage => {
  const fallbackStorage = new Map<string, string>()

  return {
    getItem: (name) => fallbackStorage.get(name) ?? null,
    removeItem: (name) => {
      fallbackStorage.delete(name)
    },
    setItem: (name, value) => {
      fallbackStorage.set(name, value)
    },
  }
}

const getBrowserStorage = (): StateStorage => {
  const fallbackStorage = createMemoryStorage()

  if (typeof window === 'undefined') {
    return fallbackStorage
  }

  try {
    const storage = window.localStorage
    const testKey = 'kanban-storage-test'

    storage.setItem(testKey, testKey)
    storage.removeItem(testKey)

    return {
      getItem: (name) => {
        try {
          return storage.getItem(name)
        } catch {
          return fallbackStorage.getItem(name)
        }
      },
      removeItem: (name) => {
        try {
          storage.removeItem(name)
        } catch {
          fallbackStorage.removeItem(name)
        }
      },
      setItem: (name, value) => {
        try {
          storage.setItem(name, value)
        } catch {
          fallbackStorage.setItem(name, value)
        }
      },
    }
  } catch {
    return fallbackStorage
  }
}

export const useBoardStore = create<BoardState>()(
  persist(
    (set) => ({
      tasks: [],

      addTask: (title) => {
        const trimmedTitle = title.trim()

        if (!trimmedTitle) {
          return
        }

        set((state) => ({
          tasks: [
            ...state.tasks,
            {
              id: createTaskId(),
              title: trimmedTitle,
              column: 'todo',
            },
          ],
        }))
      },

      moveTask: (id, column) =>
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id
              ? { ...task, column }
              : task
          ),
        })),

      deleteTask: (id) =>
        set((state) => ({
          tasks: state.tasks.filter((task) => task.id !== id),
        })),
    }),
    {
      name: 'kanban-storage',
      storage: createJSONStorage(getBrowserStorage),
    }
  )
)
