'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Edit, Trash2, Bot } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

// Define the Persona type since it's not available in config-schemas
interface Persona {
  id: string;
  title: string;
  description: string;
  prompt: string;
  createdAt: Date;
  updatedAt: Date;
}

type PersonaFormErrors = {
  title?: string;
  prompt?: string;
};

const DEFAULT_PERSONAS: Persona[] = [
  {
    id: '1',
    title: 'Helpful Assistant',
    description: 'A friendly and informative assistant',
    prompt: 'You are a helpful assistant. Always be polite and informative. Provide clear and concise answers to users\' questions.',
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: '2',
    title: 'Code Reviewer',
    description: 'An expert code reviewer',
    prompt: 'You are an expert code reviewer. Focus on code quality, performance, best practices, and potential bugs. Provide constructive feedback and suggestions for improvement.',
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: '3',
    title: 'Creative Writer',
    description: 'A creative and imaginative writer',
    prompt: 'You are a creative writer. Help users with their creative writing projects. Provide suggestions for plot, character development, dialogue, and style.',
    createdAt: new Date(),
    updatedAt: new Date()
  }
]

const clonePersonas = (list: Persona[]): Persona[] =>
  list.map((persona) => ({
    ...persona,
    createdAt: new Date(persona.createdAt),
    updatedAt: new Date(persona.updatedAt)
  }))

const loadInitialPersonas = (): Persona[] => {
  if (typeof window === 'undefined') {
    return clonePersonas(DEFAULT_PERSONAS)
  }

  try {
    const stored = localStorage.getItem('personas')
    if (stored) {
      const parsed = JSON.parse(stored)
      return parsed.map((persona: Persona) => ({
        ...persona,
        createdAt: new Date(persona.createdAt),
        updatedAt: new Date(persona.updatedAt)
      }))
    }

    localStorage.setItem('personas', JSON.stringify(DEFAULT_PERSONAS))
    return clonePersonas(DEFAULT_PERSONAS)
  } catch (error) {
    console.error('Failed to load personas:', error)
    return clonePersonas(DEFAULT_PERSONAS)
  }
}

export default function PersonasPage() {
  const [personas, setPersonas] = useState<Persona[]>(() => loadInitialPersonas())
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [formData, setFormData] = useState<Omit<Persona, 'id'>>({ 
    title: '', 
    description: '', 
    prompt: '',
    createdAt: new Date(),
    updatedAt: new Date()
  })
  const [formErrors, setFormErrors] = useState<PersonaFormErrors>({})
  const { toast } = useToast()

  const clearFormError = (field: keyof PersonaFormErrors, value: string) => {
    if (!formErrors[field]) {
      return
    }

    if (!value.trim()) {
      return
    }

    setFormErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const validateForm = useCallback(() => {
    const nextErrors: PersonaFormErrors = {}

    if (!formData.title.trim()) {
      nextErrors.title = 'Title is required.'
    }

    if (!formData.prompt.trim()) {
      nextErrors.prompt = 'System prompt is required.'
    }

    return nextErrors
  }, [formData])


  const savePersonas = useCallback((updatedPersonas: Persona[]) => {
    try {
      localStorage.setItem('personas', JSON.stringify(updatedPersonas))
      setPersonas(updatedPersonas)
    } catch (error) {
      console.error('Failed to save personas:', error)
      toast({
        title: 'Error',
        description: 'Failed to save personas',
        variant: 'destructive'
      })
    }
  }, [toast])

  const resetForm = useCallback(() => {
    setEditingPersona(null)
    setFormData({ 
      title: '', 
      description: '', 
      prompt: '',
      createdAt: new Date(),
      updatedAt: new Date()
    })
    setFormErrors({})
  }, [])

  const handleFormSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()

    const nextErrors = validateForm()
    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors)
      return
    }

    setFormErrors({})
    
    if (editingPersona) {
      // Update existing persona
      const updatedPersonas = personas.map(p => 
        p.id === editingPersona.id 
          ? { 
              ...formData, 
              id: editingPersona.id,
              updatedAt: new Date()
            } 
          : p
      )
      savePersonas(updatedPersonas)
    } else {
      // Create new persona
      const newPersona: Persona = {
        ...formData,
        id: Date.now().toString(),
        createdAt: new Date(),
        updatedAt: new Date()
      }
      savePersonas([...personas, newPersona])
    }
    
    resetForm()
    setIsDialogOpen(false)
  }, [editingPersona, formData, personas, resetForm, savePersonas, validateForm])

  const handleEdit = (persona: Persona) => {
    setFormErrors({})
    setEditingPersona(persona)
    setFormData({
      title: persona.title,
      description: persona.description,
      prompt: persona.prompt,
      createdAt: persona.createdAt,
      updatedAt: persona.updatedAt
    })
    setIsDialogOpen(true)
  }

  const handleDelete = (id: string) => {
    const updatedPersonas = personas.filter(p => p.id !== id)
    savePersonas(updatedPersonas)
    toast({
      title: 'Deleted',
      description: 'Persona deleted successfully'
    })
  }

  const openCreateDialog = () => {
    resetForm()
    setIsDialogOpen(true)
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">Personas</h1>
            <Badge variant="secondary">{personas.length} total</Badge>
          </div>
          <p className="text-muted-foreground">
            Create and manage custom AI personas stored locally in your browser.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Create Persona
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingPersona ? 'Edit Persona' : 'Create New Persona'}</DialogTitle>
              <DialogDescription>
                {editingPersona 
                  ? 'Modify the details of your persona' 
                  : 'Create a new persona with custom instructions'}
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleFormSubmit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <label htmlFor="title" className="text-sm font-medium">Title</label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => {
                    const value = e.target.value
                    setFormData((prev) => ({ ...prev, title: value }))
                    clearFormError('title', value)
                  }}
                  placeholder="Persona title"
                  required
                  aria-invalid={Boolean(formErrors.title)}
                  aria-describedby={formErrors.title ? 'persona-title-error' : undefined}
                />
                {formErrors.title && (
                  <p id="persona-title-error" className="text-xs text-destructive">
                    {formErrors.title}
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <label htmlFor="description" className="text-sm font-medium">Description</label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => {
                    const value = e.target.value
                    setFormData((prev) => ({ ...prev, description: value }))
                  }}
                  placeholder="Brief description of the persona"
                />
              </div>
              
              <div className="space-y-2">
                <label htmlFor="prompt" className="text-sm font-medium">System Prompt</label>
                <Textarea
                  id="prompt"
                  value={formData.prompt}
                  onChange={(e) => {
                    const value = e.target.value
                    setFormData((prev) => ({ ...prev, prompt: value }))
                    clearFormError('prompt', value)
                  }}
                  placeholder="Enter the system prompt that defines the persona's behavior..."
                  rows={8}
                  required
                  aria-invalid={Boolean(formErrors.prompt)}
                  aria-describedby={formErrors.prompt ? 'persona-prompt-error' : undefined}
                />
                {formErrors.prompt && (
                  <p id="persona-prompt-error" className="text-xs text-destructive">
                    {formErrors.prompt}
                  </p>
                )}
              </div>
              
              <div className="flex justify-end space-x-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">
                  {editingPersona ? 'Update Persona' : 'Create Persona'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {personas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Personas Created</h3>
            <p className="text-muted-foreground mb-4">
              Create your first persona to customize AI behavior for specific tasks
            </p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Persona
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {personas.map((persona) => (
            <Card key={persona.id} className="flex flex-col">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-xl">{persona.title}</CardTitle>
                    <CardDescription className="mt-1">{persona.description}</CardDescription>
                  </div>
                  <Badge variant="secondary" className="self-start">
                    {new Date(persona.createdAt).toLocaleDateString()}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="text-sm text-muted-foreground mb-4 line-clamp-3">
                  {persona.prompt}
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-xs text-muted-foreground">
                    Updated {new Date(persona.updatedAt).toLocaleDateString()}
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(persona)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(persona.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>How to Use Personas</CardTitle>
          <CardDescription>
            Personas allow you to customize AI behavior with specific instructions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium">1. Create Personas</h4>
              <p className="text-sm text-muted-foreground">
                Define custom instructions and behaviors for different AI assistants
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">2. Apply in Chats</h4>
              <p className="text-sm text-muted-foreground">
                Use personas in multi-LLM chats to get consistent behavior
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">3. Share & Reuse</h4>
              <p className="text-sm text-muted-foreground">
                Reuse personas across different conversations and projects
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
