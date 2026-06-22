import { type FormEvent, useMemo, useState } from 'react'
import {
  type Column,
  type Task,
  useBoardStore,
} from './store/useBoardStore'
import './App.css'

type BoardColumn = {
  id: Column
  title: string
  actionLabel: string
  nextColumn?: Column
}

const BOARD_COLUMNS: BoardColumn[] = [
  {
    id: 'todo',
    title: 'To Do',
    actionLabel: 'Verplaats taak naar Doing',
    nextColumn: 'doing',
  },
  {
    id: 'doing',
    title: 'Doing',
    actionLabel: 'Verplaats taak naar Done',
    nextColumn: 'done',
  },
  {
    id: 'done',
    title: 'Done',
    actionLabel: 'Verwijder taak',
  },
]

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

function App() {
  const [title, setTitle] = useState('')

  const tasks = useBoardStore((state) => state.tasks)
  const addTask = useBoardStore((state) => state.addTask)
  const moveTask = useBoardStore((state) => state.moveTask)
  const deleteTask = useBoardStore((state) => state.deleteTask)

  const tasksByColumn = useMemo(() => getTasksByColumn(tasks), [tasks])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!title.trim()) {
      return
    }

    addTask(title)
    setTitle('')
  }

  return (
    <div className="app">
      <h1>Done & Dusted</h1>

      <form className="form" onSubmit={handleSubmit}>
        <label className="visually-hidden" htmlFor="task-title">
          Nieuwe taak
        </label>
        <input
          id="task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nieuwe taak"
        />

        <button type="submit">
          Toevoegen
        </button>
      </form>

      <div className="board">
        {BOARD_COLUMNS.map((column) => (
          <section className="column" key={column.id} aria-labelledby={column.id}>
            <h2 id={column.id}>{column.title}</h2>

            <ul className="task-list">
              {tasksByColumn[column.id].map((task) => (
                <li key={task.id} className="task-card">
                  <span className="task-text">{task.title}</span>

                  <button
                    aria-label={`${column.actionLabel}: ${task.title}`}
                    className="move-btn"
                    onClick={() => {
                      if (column.nextColumn) {
                        moveTask(task.id, column.nextColumn)
                        return
                      }

                      deleteTask(task.id)
                    }}
                    type="button"
                  >
                    {column.nextColumn ? '→' : '🗑️'}
                  </button>
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
