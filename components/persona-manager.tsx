"use client";

import React, { useState } from 'react';
import { usePersonas } from '@/hooks/use-personas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PersonaManagerProps {
  userId?: string;
}

export function PersonaManager({ userId }: PersonaManagerProps) {
  const { personas, createPersona, deletePersona, isLoading, error } = usePersonas();
  const [newPersonaTitle, setNewPersonaTitle] = useState('');
  const [newPersonaDescription, setNewPersonaDescription] = useState('');
  const [newPersonaPrompt, setNewPersonaPrompt] = useState('');

  const handleSavePersona = async () => {
    if (!newPersonaTitle || !newPersonaPrompt) return;
    await createPersona({
      title: newPersonaTitle,
      description: newPersonaDescription || null,
      prompt: newPersonaPrompt,
    });
    setNewPersonaTitle('');
    setNewPersonaDescription('');
    setNewPersonaPrompt('');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create New Persona</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Persona Title"
            value={newPersonaTitle}
            onChange={(e) => setNewPersonaTitle(e.target.value)}
          />
          <Input
            placeholder="Description (optional)"
            value={newPersonaDescription}
            onChange={(e) => setNewPersonaDescription(e.target.value)}
          />
          <Textarea
            placeholder="System Prompt"
            value={newPersonaPrompt}
            onChange={(e) => setNewPersonaPrompt(e.target.value)}
            rows={5}
          />
          <Button onClick={handleSavePersona}>Save Persona</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saved Personas</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p>Loading personas...</p>}
          {error && <p className="text-red-500">{error.message}</p>}
          <div className="space-y-4">
            {personas.map((persona) => (
              <Card key={persona.id}>
                <CardHeader>
                  <CardTitle>{persona.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-gray-500">{persona.description}</p>
                  <pre className="text-xs bg-gray-800 p-2 rounded-md whitespace-pre-wrap">{persona.prompt}</pre>
                  <div className="flex space-x-2">
                    <Button variant="outline" size="sm" onClick={() => { /* Implement edit functionality */ }}>Edit</Button>
                    <Button variant="destructive" size="sm" onClick={() => deletePersona(persona.id)}>Delete</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
