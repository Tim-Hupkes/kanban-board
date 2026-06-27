import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

export type Column = 'todo' | 'doing' | 'done'
export type Priority = 'low' | 'medium' | 'high'

export interface Task {
  id: string
  title: string
  description: string
  column: Column
  priority: Priority
  dueDate?: string
  labels: string[]
  createdAt: string
}

interface BoardState {
  tasks: Task[]
  addTask: (task: TaskInput) => void
  updateTask: (id: string, task: TaskInput) => void
  moveTask: (id: string, column: Column, targetIndex?: number) => void
  deleteTask: (id: string) => void
  importBoard: (tasks: Task[]) => void
}

export type TaskInput = {
  title: string
  description: string
  priority: Priority
  dueDate?: string
  labels: string[]
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

      addTask: (task) => {
        const trimmedTitle = task.title.trim()

        if (!trimmedTitle) {
          return
        }

        set((state) => ({
          tasks: [
            ...state.tasks,
            {
              id: createTaskId(),
              title: trimmedTitle,
              description: task.description.trim(),
              column: 'todo',
              priority: task.priority,
              dueDate: task.dueDate,
              labels: task.labels,
              createdAt: new Date().toISOString(),
            },
          ],
        }))
      },

      updateTask: (id, task) =>
        set((state) => ({
          tasks: state.tasks.map((existingTask) =>
            existingTask.id === id
              ? {
                  ...existingTask,
                  title: task.title.trim(),
                  description: task.description.trim(),
                  priority: task.priority,
                  dueDate: task.dueDate,
                  labels: task.labels,
                }
              : existingTask
          ),
        })),

      moveTask: (id, column, targetIndex) =>
        set((state) => {
          const movingTask = state.tasks.find((task) => task.id === id)

          if (!movingTask) {
            return state
          }

          const remainingTasks = state.tasks.filter((task) => task.id !== id)
          const nextTask = { ...movingTask, column }

          if (typeof targetIndex !== 'number') {
            return {
              tasks: [...remainingTasks, nextTask],
            }
          }

          const columnTasks = remainingTasks.filter((task) => task.column === column)
          const beforeTarget = columnTasks.slice(0, targetIndex)
          const insertAfterId = beforeTarget.at(-1)?.id

          if (!insertAfterId) {
            const firstTargetTask = columnTasks[0]

            if (!firstTargetTask) {
              return {
                tasks: [...remainingTasks, nextTask],
              }
            }

            const firstIndex = remainingTasks.findIndex(
              (task) => task.id === firstTargetTask.id
            )

            return {
              tasks: [
                ...remainingTasks.slice(0, firstIndex),
                nextTask,
                ...remainingTasks.slice(firstIndex),
              ],
            }
          }

          const insertIndex = remainingTasks.findIndex(
            (task) => task.id === insertAfterId
          ) + 1

          return {
            tasks: [
              ...remainingTasks.slice(0, insertIndex),
              nextTask,
              ...remainingTasks.slice(insertIndex),
            ],
          }
        }),

      deleteTask: (id) =>
        set((state) => ({
          tasks: state.tasks.filter((task) => task.id !== id),
        })),

      importBoard: (tasks) =>
        set({
          tasks,
        }),
    }),
    {
      name: 'kanban-storage',
      storage: createJSONStorage(getBrowserStorage),
      version: 2,
      migrate: (persistedState) => {
        const state = persistedState as Partial<BoardState> | undefined
        const tasks = state?.tasks ?? []

        return {
          tasks: tasks.map((task) => ({
            ...task,
            description: task.description ?? '',
            priority: task.priority ?? 'medium',
            dueDate: task.dueDate,
            labels: task.labels ?? [],
            createdAt: task.createdAt ?? new Date().toISOString(),
          })),
        }
      },
    }
  )
)
