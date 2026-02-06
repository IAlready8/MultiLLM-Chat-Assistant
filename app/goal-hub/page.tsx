'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Plus, Target, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

interface Goal {
  id: string
  title: string
  description: string
  status: 'not-started' | 'in-progress' | 'completed' | 'delayed'
  progress: number
  startDate: string
  endDate: string
  tasks: Task[]
}

interface Task {
  id: string
  title: string
  completed: boolean
  dueDate?: string
}

export default function GoalHubPage() {
  const goals = useMemo<Goal[]>(() => [
    {
      id: 'goal-1',
      title: 'Research Quantum Computing Applications',
      description: 'Explore how quantum computing can be applied to LLM optimization',
      status: 'in-progress',
      progress: 65,
      startDate: '2023-10-15',
      endDate: '2024-01-15',
      tasks: [
        { id: 'task-1', title: 'Literature review', completed: true, dueDate: '2023-11-05' },
        { id: 'task-2', title: 'Experiment design', completed: true, dueDate: '2023-11-20' },
        { id: 'task-3', title: 'Initial testing', completed: false, dueDate: '2023-12-10' },
        { id: 'task-4', title: 'Analysis', completed: false, dueDate: '2024-01-05' },
      ]
    },
    {
      id: 'goal-2',
      title: 'Optimize LLM Response Times',
      description: 'Reduce average response time by 30% through caching and model optimization',
      status: 'not-started',
      progress: 0,
      startDate: '2023-11-01',
      endDate: '2024-02-01',
      tasks: [
        { id: 'task-5', title: 'Baseline measurement', completed: false, dueDate: '2023-11-10' },
        { id: 'task-6', title: 'Caching implementation', completed: false, dueDate: '2023-12-02' },
        { id: 'task-7', title: 'Performance testing', completed: false, dueDate: '2024-01-12' },
      ]
    },
    {
      id: 'goal-3',
      title: 'Improve Multi-Model Consistency',
      description: 'Ensure consistent quality across different LLM providers',
      status: 'completed',
      progress: 100,
      startDate: '2023-09-01',
      endDate: '2023-12-01',
      tasks: [
        { id: 'task-8', title: 'Define quality metrics', completed: true },
        { id: 'task-9', title: 'Create evaluation suite', completed: true },
        { id: 'task-10', title: 'Testing and refinement', completed: true },
      ]
    }
  ], [])
  const [activeGoal, setActiveGoal] = useState<Goal | null>(goals[0] ?? null)
  const { toast } = useToast()

  const getStatusColor = (status: Goal['status']) => {
    switch (status) {
      case 'completed': return 'bg-green-500'
      case 'in-progress': return 'bg-blue-500'
      case 'delayed': return 'bg-red-500'
      case 'not-started': return 'bg-gray-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusIcon = (status: Goal['status']) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'in-progress': return <Clock className="w-4 h-4 text-blue-500" />
      case 'delayed': return <AlertCircle className="w-4 h-4 text-red-500" />
      case 'not-started': return <Clock className="w-4 h-4 text-gray-500" />
      default: return <Clock className="w-4 h-4 text-gray-500" />
    }
  }

  const handleNewGoal = () => {
    toast({
      title: 'Coming soon',
      description: 'Goal creation is being finalized.'
    })
  }

  const handlePlaceholderAction = (label: string) => {
    toast({
      title: 'Coming soon',
      description: `${label} will be available in a future update.`
    })
  }

  const totalGoals = goals.length
  const completedGoals = goals.filter(goal => goal.status === 'completed').length
  const activeGoals = goals.filter(goal => goal.status !== 'completed').length
  const totalTasks = goals.reduce((sum, goal) => sum + goal.tasks.length, 0)
  const completedTasks = goals.reduce(
    (sum, goal) => sum + goal.tasks.filter(task => task.completed).length,
    0
  )
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
  const nextMilestone = goals
    .filter(goal => goal.status !== 'completed')
    .map(goal => new Date(goal.endDate))
    .sort((a, b) => a.getTime() - b.getTime())[0]
  const upcomingTasks = goals
    .flatMap(goal =>
      goal.tasks.map(task => ({
        ...task,
        goalTitle: goal.title,
        goalEndDate: goal.endDate,
      }))
    )
    .filter(task => !task.completed)
    .sort((a, b) => {
      const dateA = taskDateValue(a)
      const dateB = taskDateValue(b)
      return dateA - dateB
    })
    .slice(0, 4)

  function taskDateValue(task: Task & { goalEndDate: string }) {
    const dateString = task.dueDate || task.goalEndDate
    return new Date(dateString).getTime()
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
          <div className="flex items-center gap-3">
            <Badge variant="secondary">Preview</Badge>
            <Button onClick={handleNewGoal}>
              <Plus className="w-4 h-4 mr-2" />
              New Goal
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Goals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeGoals}</div>
            <p className="text-xs text-muted-foreground mt-1">{completedGoals} completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tasks Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedTasks}/{totalTasks}</div>
            <p className="text-xs text-muted-foreground mt-1">{completionRate}% overall completion</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Overall Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completionRate}%</div>
            <Progress value={completionRate} className="h-2 mt-3" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Next Milestone</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {nextMilestone ? nextMilestone.toLocaleDateString() : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Closest goal deadline</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {goals.map((goal) => (
          <Card 
            key={goal.id} 
            className={`cursor-pointer hover:shadow-lg transition-shadow ${
              activeGoal?.id === goal.id ? 'ring-2 ring-primary' : ''
            }`}
            onClick={() => setActiveGoal(goal)}
          >
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{goal.title}</CardTitle>
                  <CardDescription className="mt-1">
                    {new Date(goal.startDate).toLocaleDateString()} - {new Date(goal.endDate).toLocaleDateString()}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-1">
                  {getStatusIcon(goal.status)}
                  <Badge className={`${getStatusColor(goal.status)} text-white ml-2 capitalize`}>
                    {goal.status.replace('-', ' ')}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">{goal.description}</p>
              
              <div className="mb-2 flex justify-between text-sm">
                <span>Progress</span>
                <span>{goal.progress}%</span>
              </div>
              <Progress value={goal.progress} className="h-2 mb-4" />
              
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {goal.tasks.filter(t => t.completed).length}/{goal.tasks.length} tasks
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {activeGoal && (
        <div className="mt-8 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {activeGoal.title}
                    <Badge className={`${getStatusColor(activeGoal.status)} text-white ml-2 capitalize`}>
                      {activeGoal.status.replace('-', ' ')}
                    </Badge>
                  </CardTitle>
                  <CardDescription>{activeGoal.description}</CardDescription>
                </div>
                <Button variant="outline" onClick={() => handlePlaceholderAction('Goal editing')}>
                  Edit Goal
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium">Overall Progress</span>
                  <span className="text-sm font-medium">{activeGoal.progress}%</span>
                </div>
                <Progress value={activeGoal.progress} className="h-3" />
              </div>

              <div>
                <h3 className="text-lg font-medium mb-4">Tasks</h3>
                <div className="space-y-3">
                  {activeGoal.tasks.map((task) => (
                    <div key={task.id} className="flex items-center p-3 border rounded-lg">
                      <input
                        type="checkbox"
                        checked={task.completed}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        onChange={() => handlePlaceholderAction('Task updates')}
                      />
                      <span className={`ml-3 ${task.completed ? 'line-through text-muted-foreground' : ''}`}>
                        {task.title}
                      </span>
                      {task.dueDate && (
                        <span className="ml-auto text-sm text-muted-foreground">
                          Due: {new Date(task.dueDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t">
                <h3 className="text-lg font-medium mb-3">Goal Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Start Date</p>
                    <p>{new Date(activeGoal.startDate).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">End Date</p>
                    <p>{new Date(activeGoal.endDate).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <p className="capitalize">{activeGoal.status.replace('-', ' ')}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Completion</p>
                    <p>{activeGoal.progress}%</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Upcoming Tasks</CardTitle>
                <CardDescription>Next actions across all active goals</CardDescription>
              </CardHeader>
              <CardContent>
                {upcomingTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    You are all caught up. Great work!
                  </p>
                ) : (
                  <div className="space-y-3">
                    {upcomingTasks.map((task) => (
                      <div key={task.id} className="flex items-start justify-between gap-3 border rounded-lg p-3">
                        <div>
                          <p className="text-sm font-medium">{task.title}</p>
                          <p className="text-xs text-muted-foreground">{task.goalTitle}</p>
                        </div>
                        <Badge variant="outline">
                          {new Date(task.dueDate || task.goalEndDate).toLocaleDateString()}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Focus Summary</CardTitle>
                <CardDescription>Where to invest attention this week</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Active Goal</p>
                    <p className="text-xs text-muted-foreground">{activeGoal.title}</p>
                  </div>
                  <Badge className={`${getStatusColor(activeGoal.status)} text-white capitalize`}>
                    {activeGoal.status.replace('-', ' ')}
                  </Badge>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Progress</span>
                    <span>{activeGoal.progress}%</span>
                  </div>
                  <Progress value={activeGoal.progress} className="h-2" />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Open tasks</span>
                  <span>{activeGoal.tasks.filter(task => !task.completed).length}</span>
                </div>
                <Button variant="outline" onClick={() => handlePlaceholderAction('Focus planning')}>
                  Plan next sprint
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
