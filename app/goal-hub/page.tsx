'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  Plus,
  RefreshCw,
  Save,
  Target,
  Trash2,
} from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { useGoals } from '@/hooks/use-goals'
import type { Goal } from '@/types/prisma'
import {
  encodeGoalDescription,
  parseGoalDetails,
  type GoalSubtask,
} from '@/lib/goal-metadata'

type GoalStatus = 'not-started' | 'in-progress' | 'completed' | 'delayed'

const STATUS_OPTIONS: Array<{ value: GoalStatus; label: string }> = [
  { value: 'not-started', label: 'Not started' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'delayed', label: 'Delayed' },
  { value: 'completed', label: 'Completed' },
]

const statusProgress: Record<GoalStatus, number> = {
  'not-started': 0,
  'in-progress': 55,
  delayed: 30,
  completed: 100,
}

const statusAliases: Record<string, GoalStatus> = {
  pending: 'not-started',
  todo: 'not-started',
  new: 'not-started',
  'not-started': 'not-started',
  'in-progress': 'in-progress',
  active: 'in-progress',
  doing: 'in-progress',
  delayed: 'delayed',
  blocked: 'delayed',
  done: 'completed',
  completed: 'completed',
}

const normalizeStatus = (status: string): GoalStatus =>
  statusAliases[status.toLowerCase().trim()] ?? 'not-started'

const getStatusColor = (status: GoalStatus) => {
  switch (status) {
    case 'completed':
      return 'bg-green-500'
    case 'in-progress':
      return 'bg-blue-500'
    case 'delayed':
      return 'bg-red-500'
    case 'not-started':
      return 'bg-gray-500'
  }
}

const getStatusIcon = (status: GoalStatus) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-4 h-4 text-green-500" />
    case 'in-progress':
      return <Clock className="w-4 h-4 text-blue-500" />
    case 'delayed':
      return <AlertCircle className="w-4 h-4 text-red-500" />
    case 'not-started':
      return <Clock className="w-4 h-4 text-gray-500" />
  }
}

const statusLabel = (status: GoalStatus) =>
  STATUS_OPTIONS.find((item) => item.value === status)?.label ?? 'Not started'

type EnrichedGoal = Goal & {
  status: GoalStatus
  plainDescription: string | null
  dueDate: string | null
  subtasks: GoalSubtask[]
  progress: number
  completedSubtasks: number
}

const createSubtaskId = () =>
  `subtask-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

const formatDueDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString()

export default function GoalHubPage() {
  const { goals, isLoading, error, refreshGoals, createGoal, updateGoal, deleteGoal } =
    useGoals()
  const { toast } = useToast()

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newStatus, setNewStatus] = useState<GoalStatus>('not-started')
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [newSubtasks, setNewSubtasks] = useState<GoalSubtask[]>([])
  const [activeGoalId, setActiveGoalId] = useState<string>('')
  const [savingGoal, setSavingGoal] = useState(false)
  const [deletingGoal, setDeletingGoal] = useState(false)

  const normalizedGoals = useMemo(
    () =>
      goals.map((goal) => ({
        ...goal,
        status: normalizeStatus(goal.status),
        ...parseGoalDetails(goal.description),
      }))
      .map((goal) => {
        const completedSubtasks = goal.subtasks.filter((subtask) => subtask.completed).length
        const hasSubtasks = goal.subtasks.length > 0
        const progress = hasSubtasks
          ? Math.round((completedSubtasks / goal.subtasks.length) * 100)
          : statusProgress[goal.status]

        return {
          ...goal,
          completedSubtasks,
          progress,
        } as EnrichedGoal
      }),
    [goals]
  )

  useEffect(() => {
    if (normalizedGoals.length === 0) {
      setActiveGoalId('')
      return
    }

    const activeStillExists = normalizedGoals.some((goal) => goal.id === activeGoalId)
    if (!activeStillExists) {
      setActiveGoalId(normalizedGoals[0].id)
    }
  }, [normalizedGoals, activeGoalId])

  const activeGoal = useMemo(
    () => normalizedGoals.find((goal) => goal.id === activeGoalId) ?? null,
    [normalizedGoals, activeGoalId]
  )

  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editDueDate, setEditDueDate] = useState('')
  const [editStatus, setEditStatus] = useState<GoalStatus>('not-started')
  const [editSubtaskTitle, setEditSubtaskTitle] = useState('')
  const [editSubtasks, setEditSubtasks] = useState<GoalSubtask[]>([])

  useEffect(() => {
    if (!activeGoal) {
      setEditTitle('')
      setEditDescription('')
      setEditDueDate('')
      setEditStatus('not-started')
      setEditSubtaskTitle('')
      setEditSubtasks([])
      return
    }
    setEditTitle(activeGoal.title)
    setEditDescription(activeGoal.plainDescription || '')
    setEditDueDate(activeGoal.dueDate || '')
    setEditStatus(activeGoal.status)
    setEditSubtasks(activeGoal.subtasks)
    setEditSubtaskTitle('')
  }, [activeGoal])

  const stats = useMemo(() => {
    const totalGoals = normalizedGoals.length
    const completedGoals = normalizedGoals.filter(
      (goal) => goal.status === 'completed'
    ).length
    const activeGoals = normalizedGoals.filter(
      (goal) => goal.status !== 'completed'
    ).length
    const delayedGoals = normalizedGoals.filter(
      (goal) => goal.status === 'delayed'
    ).length
    const avgProgress =
      totalGoals > 0
        ? Math.round(
            normalizedGoals.reduce(
              (sum, goal) => sum + goal.progress,
              0
            ) / totalGoals
          )
        : 0

    const nextFocusGoal = normalizedGoals
      .filter((goal) => goal.status !== 'completed')
      .sort((a, b) => {
        const dueA = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY
        const dueB = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY
        if (dueA !== dueB) {
          return dueA - dueB
        }
        return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
      })[0]

    return {
      totalGoals,
      completedGoals,
      activeGoals,
      delayedGoals,
      avgProgress,
      nextFocusGoal,
    }
  }, [normalizedGoals])

  const resetCreateForm = () => {
    setNewTitle('')
    setNewDescription('')
    setNewDueDate('')
    setNewStatus('not-started')
    setNewSubtaskTitle('')
    setNewSubtasks([])
    setShowCreateForm(false)
  }

  const addNewSubtask = () => {
    const title = newSubtaskTitle.trim()
    if (!title) return
    setNewSubtasks((current) => [
      ...current,
      { id: createSubtaskId(), title, completed: false },
    ])
    setNewSubtaskTitle('')
  }

  const removeNewSubtask = (subtaskId: string) => {
    setNewSubtasks((current) =>
      current.filter((subtask) => subtask.id !== subtaskId)
    )
  }

  const toggleNewSubtask = (subtaskId: string) => {
    setNewSubtasks((current) =>
      current.map((subtask) =>
        subtask.id === subtaskId
          ? { ...subtask, completed: !subtask.completed }
          : subtask
      )
    )
  }

  const addEditSubtask = () => {
    const title = editSubtaskTitle.trim()
    if (!title) return
    setEditSubtasks((current) => [
      ...current,
      { id: createSubtaskId(), title, completed: false },
    ])
    setEditSubtaskTitle('')
  }

  const removeEditSubtask = (subtaskId: string) => {
    setEditSubtasks((current) =>
      current.filter((subtask) => subtask.id !== subtaskId)
    )
  }

  const toggleEditSubtask = (subtaskId: string) => {
    setEditSubtasks((current) =>
      current.map((subtask) =>
        subtask.id === subtaskId
          ? { ...subtask, completed: !subtask.completed }
          : subtask
      )
    )
  }

  const handleCreateGoal = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!newTitle.trim()) {
      toast({
        title: 'Title required',
        description: 'Please enter a goal title before creating it.',
        variant: 'destructive',
      })
      return
    }

    try {
      const encodedDescription = encodeGoalDescription(
        newDescription.trim() || null,
        {
          dueDate: newDueDate || null,
          subtasks: newSubtasks,
        }
      )
      const created = await createGoal({
        title: newTitle.trim(),
        description: encodedDescription,
        status: newStatus,
      })
      setActiveGoalId(created.id)
      resetCreateForm()
      toast({
        title: 'Goal created',
        description: 'Your new goal is ready.',
      })
    } catch (err) {
      toast({
        title: 'Failed to create goal',
        description:
          err instanceof Error ? err.message : 'Unable to create goal right now.',
        variant: 'destructive',
      })
    }
  }

  const handleSaveGoal = async () => {
    if (!activeGoal) return
    if (!editTitle.trim()) {
      toast({
        title: 'Title required',
        description: 'Goal title cannot be empty.',
        variant: 'destructive',
      })
      return
    }

    setSavingGoal(true)
    try {
      const encodedDescription = encodeGoalDescription(
        editDescription.trim() || null,
        {
          dueDate: editDueDate || null,
          subtasks: editSubtasks,
        }
      )
      await updateGoal(activeGoal.id, {
        title: editTitle.trim(),
        description: encodedDescription,
        status: editStatus,
      })
      toast({
        title: 'Goal updated',
        description: 'Changes saved successfully.',
      })
    } catch (err) {
      toast({
        title: 'Failed to update goal',
        description:
          err instanceof Error ? err.message : 'Unable to update the selected goal.',
        variant: 'destructive',
      })
    } finally {
      setSavingGoal(false)
    }
  }

  const handleDeleteGoal = async () => {
    if (!activeGoal) return
    const confirmed = window.confirm(
      `Delete "${activeGoal.title}"? This action cannot be undone.`
    )
    if (!confirmed) return

    setDeletingGoal(true)
    try {
      await deleteGoal(activeGoal.id)
      toast({
        title: 'Goal deleted',
        description: 'The goal has been removed.',
      })
    } catch (err) {
      toast({
        title: 'Failed to delete goal',
        description:
          err instanceof Error ? err.message : 'Unable to delete this goal.',
        variant: 'destructive',
      })
    } finally {
      setDeletingGoal(false)
    }
  }

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <div className="mb-8">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Target className="w-8 h-8" />
              Goal Hub
            </h1>
            <p className="text-muted-foreground mt-2">
              Track and manage your multi-LLM optimization goals
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Live data</Badge>
            <Button variant="outline" onClick={() => void refreshGoals()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={() => setShowCreateForm((current) => !current)}>
              <Plus className="w-4 h-4 mr-2" />
              {showCreateForm ? 'Cancel' : 'New Goal'}
            </Button>
          </div>
        </div>
      </div>

      {showCreateForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Create New Goal</CardTitle>
            <CardDescription>
              Add a goal to track your current implementation priorities.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleCreateGoal}>
              <Input
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                placeholder="Goal title"
                maxLength={160}
              />
              <Textarea
                value={newDescription}
                onChange={(event) => setNewDescription(event.target.value)}
                placeholder="Goal description (optional)"
                rows={3}
              />
              <div className="space-y-1">
                <p className="text-sm font-medium">Due date</p>
                <Input
                  type="date"
                  value={newDueDate}
                  onChange={(event) => setNewDueDate(event.target.value)}
                />
              </div>
              <select
                value={newStatus}
                onChange={(event) => setNewStatus(event.target.value as GoalStatus)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">Subtasks</p>
                <div className="flex gap-2">
                  <Input
                    value={newSubtaskTitle}
                    onChange={(event) => setNewSubtaskTitle(event.target.value)}
                    placeholder="Add subtask"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        addNewSubtask()
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={addNewSubtask}>
                    Add
                  </Button>
                </div>
                <div className="space-y-2">
                  {newSubtasks.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No subtasks yet.</p>
                  ) : (
                    newSubtasks.map((subtask) => (
                      <div
                        key={subtask.id}
                        className="flex items-center justify-between gap-2 rounded border p-2"
                      >
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={subtask.completed}
                            onChange={() => toggleNewSubtask(subtask.id)}
                          />
                          <span
                            className={
                              subtask.completed ? 'line-through text-muted-foreground' : ''
                            }
                          >
                            {subtask.title}
                          </span>
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => removeNewSubtask(subtask.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button type="submit">Create Goal</Button>
                <Button type="button" variant="outline" onClick={resetCreateForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="mb-6 border-red-300">
          <CardContent className="pt-6 flex items-center justify-between">
            <p className="text-sm text-red-600">{error.message}</p>
            <Button variant="outline" size="sm" onClick={refreshGoals}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Goals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeGoals}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.completedGoals} completed
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Goals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalGoals}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.delayedGoals} delayed
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgProgress}%</div>
            <Progress value={stats.avgProgress} className="h-2 mt-3" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Next Focus</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-semibold line-clamp-2">
              {stats.nextFocusGoal?.title || 'No active goals'}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {stats.nextFocusGoal
                ? stats.nextFocusGoal.dueDate
                  ? `Due ${formatDueDate(stats.nextFocusGoal.dueDate)}`
                  : `Updated ${new Date(stats.nextFocusGoal.updatedAt).toLocaleDateString()}`
                : 'Create a goal to get started'}
            </p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Loading goals...</p>
          </CardContent>
        </Card>
      ) : normalizedGoals.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground mb-4">
              No goals yet. Create your first goal to start tracking implementation progress.
            </p>
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create first goal
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-3">
            {normalizedGoals.map((goal) => (
              <Card
                key={goal.id}
                className={`cursor-pointer hover:shadow-lg transition-shadow ${
                  activeGoal?.id === goal.id ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => setActiveGoalId(goal.id)}
              >
                <CardHeader>
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <CardTitle className="text-lg line-clamp-2">{goal.title}</CardTitle>
                      <CardDescription className="mt-1">
                        Created {new Date(goal.createdAt).toLocaleDateString()}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-1">
                      {getStatusIcon(goal.status)}
                      <Badge
                        className={`${getStatusColor(goal.status)} text-white ml-1 capitalize`}
                      >
                        {statusLabel(goal.status)}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                    {goal.plainDescription || 'No description provided.'}
                  </p>

                  <div className="mb-2 flex justify-between text-sm">
                    <span>Progress</span>
                    <span>{goal.progress}%</span>
                  </div>
                  <Progress value={goal.progress} className="h-2 mb-3" />

                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {goal.dueDate ? (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Due {formatDueDate(goal.dueDate)}
                      </span>
                    ) : null}
                    {goal.subtasks.length > 0 ? (
                      <span>
                        Subtasks: {goal.completedSubtasks}/{goal.subtasks.length}
                      </span>
                    ) : null}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Updated {new Date(goal.updatedAt).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {activeGoal && (
            <div className="mt-8">
              <Card>
                <CardHeader>
                  <CardTitle>Goal Details</CardTitle>
                  <CardDescription>
                    Update goal details, status, and progress signals.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                    placeholder="Goal title"
                  />
                  <Textarea
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                    placeholder="Goal description"
                    rows={4}
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Due date</p>
                    <Input
                      type="date"
                      value={editDueDate}
                      onChange={(event) => setEditDueDate(event.target.value)}
                    />
                  </div>
                  <select
                    value={editStatus}
                    onChange={(event) => setEditStatus(event.target.value as GoalStatus)}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <div className="grid gap-4 md:grid-cols-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Current Status</p>
                      <p className="font-medium">{statusLabel(editStatus)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Derived Progress</p>
                      <p className="font-medium">
                        {editSubtasks.length > 0
                          ? Math.round(
                              (editSubtasks.filter((subtask) => subtask.completed).length /
                                editSubtasks.length) *
                                100
                            )
                          : statusProgress[editStatus]}
                        %
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Due Date</p>
                      <p className="font-medium">
                        {editDueDate ? formatDueDate(editDueDate) : 'Not set'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Last Updated</p>
                      <p className="font-medium">
                        {new Date(activeGoal.updatedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-md border p-3">
                    <p className="text-sm font-medium">Subtasks</p>
                    <div className="flex gap-2">
                      <Input
                        value={editSubtaskTitle}
                        onChange={(event) => setEditSubtaskTitle(event.target.value)}
                        placeholder="Add subtask"
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            addEditSubtask()
                          }
                        }}
                      />
                      <Button type="button" variant="outline" onClick={addEditSubtask}>
                        Add
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {editSubtasks.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No subtasks yet.</p>
                      ) : (
                        editSubtasks.map((subtask) => (
                          <div
                            key={subtask.id}
                            className="flex items-center justify-between gap-2 rounded border p-2"
                          >
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={subtask.completed}
                                onChange={() => toggleEditSubtask(subtask.id)}
                              />
                              <span
                                className={
                                  subtask.completed
                                    ? 'line-through text-muted-foreground'
                                    : ''
                                }
                              >
                                {subtask.title}
                              </span>
                            </label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => removeEditSubtask(subtask.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button onClick={handleSaveGoal} disabled={savingGoal || deletingGoal}>
                      <Save className="w-4 h-4 mr-2" />
                      {savingGoal ? 'Saving...' : 'Save changes'}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleDeleteGoal}
                      disabled={savingGoal || deletingGoal}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      {deletingGoal ? 'Deleting...' : 'Delete goal'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  )
}
