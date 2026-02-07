'use client'

import { useCallback, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Edit, Trash2, Bot } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { usePersonas } from '@/hooks/use-personas'

type PersonaFormData = {
  title: string
  description: string
  prompt: string
}

type PersonaFormErrors = {
  title?: string
  prompt?: string
}

const INITIAL_FORM_DATA: PersonaFormData = {
  title: '',
  description: '',
  prompt: '',
}

const STARTER_PERSONAS: PersonaFormData[] = [
  {
    title: 'Helpful Assistant',
    description: 'A friendly and informative assistant',
    prompt:
      "You are a helpful assistant. Always be polite and informative. Provide clear and concise answers to users' questions.",
  },
  {
    title: 'Code Reviewer',
    description: 'An expert code reviewer',
    prompt:
      'You are an expert code reviewer. Focus on code quality, best practices, and potential bugs. Provide constructive, actionable feedback.',
  },
  {
    title: 'Creative Writer',
    description: 'A creative and imaginative writer',
    prompt:
      'You are a creative writing assistant. Help with plot ideas, character development, dialogue, and style with concrete suggestions.',
  },
]

export default function PersonasPage() {
  const { personas, isLoading, error, createPersona, updatePersona, deletePersona } =
    usePersonas()
  const { toast } = useToast()

  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [formData, setFormData] = useState<PersonaFormData>(INITIAL_FORM_DATA)
  const [formErrors, setFormErrors] = useState<PersonaFormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSeeding, setIsSeeding] = useState(false)

  const editingPersona = useMemo(
    () => personas.find((persona) => persona.id === editingPersonaId) ?? null,
    [editingPersonaId, personas]
  )

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
  }, [formData.prompt, formData.title])

  const resetForm = useCallback(() => {
    setEditingPersonaId(null)
    setFormData(INITIAL_FORM_DATA)
    setFormErrors({})
  }, [])

  const handleFormSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()

      const nextErrors = validateForm()
      if (Object.keys(nextErrors).length > 0) {
        setFormErrors(nextErrors)
        return
      }

      setIsSubmitting(true)
      setFormErrors({})

      try {
        const payload = {
          title: formData.title.trim(),
          description: formData.description.trim() || null,
          prompt: formData.prompt.trim(),
        }

        if (editingPersona) {
          await updatePersona(editingPersona.id, payload)
          toast({
            title: 'Persona updated',
            description: `${payload.title} was updated successfully.`,
          })
        } else {
          await createPersona(payload)
          toast({
            title: 'Persona created',
            description: `${payload.title} was created successfully.`,
          })
        }

        resetForm()
        setIsDialogOpen(false)
      } catch (submitError) {
        console.error('Failed to save persona:', submitError)
        toast({
          title: 'Save failed',
          description: 'Could not save persona changes.',
          variant: 'destructive',
        })
      } finally {
        setIsSubmitting(false)
      }
    },
    [createPersona, editingPersona, formData, resetForm, toast, updatePersona, validateForm]
  )

  const handleEdit = (personaId: string) => {
    const persona = personas.find((item) => item.id === personaId)
    if (!persona) {
      return
    }

    setEditingPersonaId(persona.id)
    setFormData({
      title: persona.title,
      description: persona.description ?? '',
      prompt: persona.prompt,
    })
    setFormErrors({})
    setIsDialogOpen(true)
  }

  const handleDelete = async (personaId: string) => {
    const persona = personas.find((item) => item.id === personaId)
    if (!persona) {
      return
    }

    const confirmed = window.confirm(`Delete "${persona.title}"?`)
    if (!confirmed) {
      return
    }

    try {
      await deletePersona(personaId)
      toast({
        title: 'Persona deleted',
        description: `${persona.title} was removed.`,
      })
    } catch (deleteError) {
      console.error('Failed to delete persona:', deleteError)
      toast({
        title: 'Delete failed',
        description: 'Could not delete this persona.',
        variant: 'destructive',
      })
    }
  }

  const openCreateDialog = () => {
    resetForm()
    setIsDialogOpen(true)
  }

  const seedStarterPersonas = async () => {
    setIsSeeding(true)
    try {
      for (const starter of STARTER_PERSONAS) {
        await createPersona({
          title: starter.title,
          description: starter.description,
          prompt: starter.prompt,
        })
      }

      toast({
        title: 'Starter personas added',
        description: 'Default personas were created successfully.',
      })
    } catch (seedError) {
      console.error('Failed to seed personas:', seedError)
      toast({
        title: 'Seed failed',
        description: 'Could not create starter personas.',
        variant: 'destructive',
      })
    } finally {
      setIsSeeding(false)
    }
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
            Create and manage reusable AI personas.
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
                  ? 'Modify this persona.'
                  : 'Create a new persona with custom instructions.'}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleFormSubmit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(event) => {
                    const value = event.target.value
                    setFormData((prev) => ({ ...prev, title: value }))
                    clearFormError('title', value)
                  }}
                  placeholder="Persona title"
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
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, description: event.target.value }))
                  }
                  placeholder="Brief description"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="prompt">System Prompt</Label>
                <Textarea
                  id="prompt"
                  value={formData.prompt}
                  onChange={(event) => {
                    const value = event.target.value
                    setFormData((prev) => ({ ...prev, prompt: value }))
                    clearFormError('prompt', value)
                  }}
                  placeholder="Define how this persona should behave..."
                  rows={8}
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
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting
                    ? 'Saving...'
                    : editingPersona
                    ? 'Update Persona'
                    : 'Create Persona'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="py-4 text-sm text-destructive">
            Failed to load personas: {error.message}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Loading personas...
          </CardContent>
        </Card>
      ) : personas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Personas Yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first persona, or start with built-in templates.
            </p>
            <div className="flex justify-center gap-2">
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Create Persona
              </Button>
              <Button variant="outline" onClick={seedStarterPersonas} disabled={isSeeding}>
                {isSeeding ? 'Adding...' : 'Load Starter Personas'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {personas.map((persona) => (
            <Card key={persona.id} className="flex flex-col">
              <CardHeader>
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <CardTitle className="text-xl">{persona.title}</CardTitle>
                    <CardDescription className="mt-1">
                      {persona.description || 'No description provided.'}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" className="self-start">
                    {new Date(persona.createdAt).toLocaleDateString()}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="text-sm text-muted-foreground mb-4 line-clamp-4">
                  {persona.prompt}
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-xs text-muted-foreground">
                    Updated {new Date(persona.updatedAt).toLocaleDateString()}
                  </div>
                  <div className="flex space-x-2">
                    <Button variant="outline" size="sm" onClick={() => handleEdit(persona.id)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
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
    </div>
  )
}
