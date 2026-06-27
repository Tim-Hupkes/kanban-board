import { type ChangeEvent, type DragEvent, type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  type Column,
  type Priority,
  type Task,
  type TaskInput,
  useBoardStore,
} from './store/useBoardStore'
import './App.css'

type BoardColumn = {
  id: Column
  title: string
}

type DragState = {
  taskId: string
  column: Column
}

type Filters = {
  search: string
  priority: Priority | 'all'
  status: Column | 'all'
}

type FilePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string
    types: Array<{
      description: string
      accept: Record<string, string[]>
    }>
  }) => Promise<{
    createWritable: () => Promise<{
      write: (contents: Blob) => Promise<void>
      close: () => Promise<void>
    }>
  }>
}

const BOARD_COLUMNS: BoardColumn[] = [
  { id: 'todo', title: 'To Do' },
  { id: 'doing', title: 'Doing' },
  { id: 'done', title: 'Done' },
]

const EMPTY_FORM: TaskInput = {
  title: '',
  description: '',
  priority: 'medium',
  dueDate: '',
  labels: [],
}

const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

const getTasksByColumn = (tasks: Task[]) =>
  tasks.reduce<Record<Column, Task[]>>(
    (columns, task) => {
      columns[task.column].push(task)
      return columns
    },
    {
      todo: [],
      doing: [],
      done: [],
    }
  )

const labelsFromInput = (value: string) =>
  value
    .split(',')
    .map((label) => label.trim())
    .filter(Boolean)

const labelsToInput = (labels: string[]) => labels.join(', ')

const isOverdue = (dueDate?: string) => {
  if (!dueDate) {
    return false
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return new Date(`${dueDate}T00:00:00`) < today
}

const normaliseImportedTasks = (value: unknown): Task[] | null => {
  if (!Array.isArray(value)) {
    return null
  }

  const validColumns = new Set<Column>(['todo', 'doing', 'done'])
  const validPriorities = new Set<Priority>(['low', 'medium', 'high'])

  return value.map((task): Task => {
    const candidate = task as Partial<Task>
    const column = validColumns.has(candidate.column as Column)
      ? candidate.column as Column
      : 'todo'
    const priority = validPriorities.has(candidate.priority as Priority)
      ? candidate.priority as Priority
      : 'medium'

    return {
      id: candidate.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: candidate.title?.trim() || 'Naamloze taak',
      description: candidate.description?.trim() || '',
      column,
      priority,
      dueDate: candidate.dueDate || '',
      labels: Array.isArray(candidate.labels)
        ? candidate.labels.filter((label): label is string => typeof label === 'string')
        : [],
      createdAt: candidate.createdAt || new Date().toISOString(),
    }
  })
}

function App() {
  const [formTask, setFormTask] = useState<TaskInput>(EMPTY_FORM)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editingTask, setEditingTask] = useState<TaskInput>(EMPTY_FORM)
  const [filters, setFilters] = useState<Filters>({
    search: '',
    priority: 'all',
    status: 'all',
  })
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<Column | null>(null)
  const [importMessage, setImportMessage] = useState('')
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return window.localStorage.getItem('kanban-theme') === 'dark'
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const tasks = useBoardStore((state) => state.tasks)
  const addTask = useBoardStore((state) => state.addTask)
  const updateTask = useBoardStore((state) => state.updateTask)
  const moveTask = useBoardStore((state) => state.moveTask)
  const deleteTask = useBoardStore((state) => state.deleteTask)
  const importBoard = useBoardStore((state) => state.importBoard)

  useEffect(() => {
    document.documentElement.dataset.theme = isDarkMode ? 'dark' : 'light'
    window.localStorage.setItem('kanban-theme', isDarkMode ? 'dark' : 'light')
  }, [isDarkMode])

  const filteredTasks = useMemo(() => {
    const search = filters.search.trim().toLowerCase()

    return tasks.filter((task) => {
      const matchesSearch = !search || task.title.toLowerCase().includes(search)
      const matchesPriority = filters.priority === 'all' || task.priority === filters.priority
      const matchesStatus = filters.status === 'all' || task.column === filters.status

      return matchesSearch && matchesPriority && matchesStatus
    })
  }, [filters, tasks])

  const tasksByColumn = useMemo(() => getTasksByColumn(filteredTasks), [filteredTasks])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!formTask.title.trim()) {
      return
    }

    addTask(formTask)
    setFormTask(EMPTY_FORM)
  }

  const handleEditSubmit = (event: FormEvent<HTMLFormElement>, taskId: string) => {
    event.preventDefault()

    if (!editingTask.title.trim()) {
      return
    }

    updateTask(taskId, editingTask)
    setEditingTaskId(null)
    setEditingTask(EMPTY_FORM)
  }

  const startEditing = (task: Task) => {
    setEditingTaskId(task.id)
    setEditingTask({
      title: task.title,
      description: task.description,
      priority: task.priority,
      dueDate: task.dueDate || '',
      labels: task.labels,
    })
  }

  const updateFormTask = (field: keyof TaskInput, value: string | string[]) => {
    setFormTask((task) => ({
      ...task,
      [field]: value,
    }))
  }

  const updateEditingTask = (field: keyof TaskInput, value: string | string[]) => {
    setEditingTask((task) => ({
      ...task,
      [field]: value,
    }))
  }

  const getDropIndex = (event: DragEvent<HTMLElement>, column: Column) => {
    const cards = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[data-task-id]')
    ).filter((card) => card.dataset.taskId !== dragState?.taskId)

    const targetIndex = cards.findIndex((card) => {
      const box = card.getBoundingClientRect()
      return event.clientY < box.top + box.height / 2
    })

    if (targetIndex === -1) {
      return tasks.filter((task) => task.column === column && task.id !== dragState?.taskId).length
    }

    return targetIndex
  }

  const handleDrop = (event: DragEvent<HTMLElement>, column: Column) => {
    event.preventDefault()

    if (!dragState) {
      return
    }

    moveTask(dragState.taskId, column, getDropIndex(event, column))
    setDragState(null)
    setDragOverColumn(null)
  }

  const exportBoard = async () => {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], {
      type: 'application/json',
    })
    const fileName = `kanban-board-${new Date().toISOString().slice(0, 10)}.json`
    const filePicker = (window as FilePickerWindow).showSaveFilePicker

    if (filePicker) {
      try {
        const handle = await filePicker({
          suggestedName: fileName,
          types: [
            {
              description: 'Kanban-bestand',
              accept: {
                'application/json': ['.json'],
              },
            },
          ],
        })
        const writable = await handle.createWritable()

        await writable.write(blob)
        await writable.close()
        setImportMessage('Je bord is opgeslagen.')
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
      }
    }

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
    setImportMessage('Je bord is gedownload.')
  }

  const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    try {
      const parsed = JSON.parse(await file.text())
      const tasksToImport = normaliseImportedTasks(parsed.tasks ?? parsed)

      if (!tasksToImport) {
        throw new Error('Geen taken gevonden')
      }

      importBoard(tasksToImport)
      setImportMessage(`${tasksToImport.length} taken uit bestand geopend.`)
    } catch {
      setImportMessage('Openen mislukt. Kies een geldig Kanban-bestand.')
    } finally {
      event.target.value = ''
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Kanban Board</p>
          <h1>Done & Dusted</h1>
        </div>

        <button
          className="theme-toggle"
          onClick={() => setIsDarkMode((mode) => !mode)}
          type="button"
          aria-pressed={isDarkMode}
        >
          {isDarkMode ? 'Light' : 'Dark'}
        </button>
      </header>

      <section className="toolbar" aria-label="Board acties">
        <form className="task-form" onSubmit={handleSubmit}>
          <label className="visually-hidden" htmlFor="task-title">
            Nieuwe taak
          </label>
          <input
            id="task-title"
            value={formTask.title}
            onChange={(event) => updateFormTask('title', event.target.value)}
            placeholder="Nieuwe taak"
          />

          <input
            value={formTask.description}
            onChange={(event) => updateFormTask('description', event.target.value)}
            placeholder="Beschrijving"
          />

          <select
            value={formTask.priority}
            onChange={(event) => updateFormTask('priority', event.target.value as Priority)}
            aria-label="Prioriteit"
          >
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={formTask.dueDate}
            onChange={(event) => updateFormTask('dueDate', event.target.value)}
            aria-label="Deadline"
          />

          <input
            value={labelsToInput(formTask.labels)}
            onChange={(event) => updateFormTask('labels', labelsFromInput(event.target.value))}
            placeholder="Labels"
          />

          <button type="submit">Toevoegen</button>
        </form>

        <div className="board-tools">
          <button type="button" onClick={exportBoard}>
            Bord opslaan
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            Bord openen
          </button>
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={importJson}
          />
        </div>
      </section>

      {importMessage && <p className="status-message">{importMessage}</p>}

      <section className="filters" aria-label="Zoeken en filteren">
        <input
          value={filters.search}
          onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
          placeholder="Zoek op titel"
        />

        <select
          value={filters.priority}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              priority: event.target.value as Filters['priority'],
            }))
          }
          aria-label="Filter op prioriteit"
        >
          <option value="all">Alle prioriteiten</option>
          {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={filters.status}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              status: event.target.value as Filters['status'],
            }))
          }
          aria-label="Filter op status"
        >
          <option value="all">Alle statussen</option>
          {BOARD_COLUMNS.map((column) => (
            <option key={column.id} value={column.id}>
              {column.title}
            </option>
          ))}
        </select>
      </section>

      <div className="board">
        {BOARD_COLUMNS.map((column) => (
          <section
            className={`column ${dragOverColumn === column.id ? 'is-drag-over' : ''}`}
            key={column.id}
            aria-labelledby={column.id}
            onDragOver={(event) => {
              event.preventDefault()
              setDragOverColumn(column.id)
            }}
            onDragLeave={() => setDragOverColumn(null)}
            onDrop={(event) => handleDrop(event, column.id)}
          >
            <h2 id={column.id}>
              <span>{column.title}</span>
              <strong>{tasksByColumn[column.id].length}</strong>
            </h2>

            <ul className="task-list">
              {tasksByColumn[column.id].map((task) => (
                <li
                  key={task.id}
                  className={`task-card priority-${task.priority} ${dragState?.taskId === task.id ? 'is-dragging' : ''}`}
                  data-task-id={task.id}
                  draggable={editingTaskId !== task.id}
                  onDragStart={() => setDragState({ taskId: task.id, column: task.column })}
                  onDragEnd={() => {
                    setDragState(null)
                    setDragOverColumn(null)
                  }}
                >
                  {editingTaskId === task.id ? (
                    <form className="edit-form" onSubmit={(event) => handleEditSubmit(event, task.id)}>
                      <input
                        value={editingTask.title}
                        onChange={(event) => updateEditingTask('title', event.target.value)}
                        aria-label="Taaktitel"
                      />
                      <textarea
                        value={editingTask.description}
                        onChange={(event) => updateEditingTask('description', event.target.value)}
                        aria-label="Beschrijving"
                        placeholder="Beschrijving"
                      />
                      <div className="edit-grid">
                        <select
                          value={editingTask.priority}
                          onChange={(event) => updateEditingTask('priority', event.target.value as Priority)}
                          aria-label="Prioriteit"
                        >
                          {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="date"
                          value={editingTask.dueDate}
                          onChange={(event) => updateEditingTask('dueDate', event.target.value)}
                          aria-label="Deadline"
                        />
                      </div>
                      <input
                        value={labelsToInput(editingTask.labels)}
                        onChange={(event) => updateEditingTask('labels', labelsFromInput(event.target.value))}
                        aria-label="Labels"
                        placeholder="Labels"
                      />
                      <div className="card-actions">
                        <button type="submit">Opslaan</button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTaskId(null)
                            setEditingTask(EMPTY_FORM)
                          }}
                        >
                          Annuleer
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="task-content">
                        <div className="task-topline">
                          <span className="priority-dot" aria-label={`Prioriteit ${PRIORITY_LABELS[task.priority]}`} />
                          <span className="task-text">{task.title}</span>
                        </div>
                        {task.description && <p>{task.description}</p>}
                        <div className="task-meta">
                          <span className={`priority-pill ${task.priority}`}>
                            {PRIORITY_LABELS[task.priority]}
                          </span>
                          {task.dueDate && (
                            <time
                              className={isOverdue(task.dueDate) ? 'is-overdue' : ''}
                              dateTime={task.dueDate}
                            >
                              {task.dueDate}
                            </time>
                          )}
                        </div>
                        {task.labels.length > 0 && (
                          <div className="labels" aria-label="Labels">
                            {task.labels.map((label) => (
                              <span key={label}>{label}</span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="card-actions">
                        <button type="button" onClick={() => startEditing(task)}>
                          Bewerk
                        </button>
                        <button type="button" onClick={() => deleteTask(task.id)}>
                          Wis
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

export default App
