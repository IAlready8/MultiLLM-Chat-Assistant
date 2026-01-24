'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import ApiKeyForm from '@/components/api-key-form'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general')
  const { toast } = useToast()
  const handlePlaceholderAction = (label: string) => {
    toast({
      title: 'Coming soon',
      description: `${label} will be available in a future update.`
    })
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Settings</CardTitle>
            <Badge variant="secondary">Secure</Badge>
          </div>
          <CardDescription>Configure your account preferences and API providers</CardDescription>
        </CardHeader>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-4">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="providers">API Providers</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Account Settings</CardTitle>
              <CardDescription>Manage your account preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" placeholder="Your name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="your.email@example.com" />
              </div>
              <Button type="button" onClick={() => handlePlaceholderAction('Profile updates')}>
                Save changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="providers" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>API Provider Configuration</CardTitle>
              <CardDescription>Configure your LLM provider API keys and settings</CardDescription>
            </CardHeader>
            <CardContent>
              <ApiKeyForm />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Appearance Settings</CardTitle>
              <CardDescription>Customize the look and feel of the application</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Theme</Label>
                <div className="flex space-x-4">
                  <Button variant="outline" onClick={() => handlePlaceholderAction('Light theme')}>
                    Light
                  </Button>
                  <Button variant="default" onClick={() => handlePlaceholderAction('Dark theme')}>
                    Dark
                  </Button>
                  <Button variant="outline" onClick={() => handlePlaceholderAction('System theme')}>
                    System
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Font Size</Label>
                <div className="flex space-x-2">
                  <Button variant="outline" size="sm" onClick={() => handlePlaceholderAction('Small font size')}>
                    Small
                  </Button>
                  <Button variant="default" size="sm" onClick={() => handlePlaceholderAction('Normal font size')}>
                    Normal
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handlePlaceholderAction('Large font size')}>
                    Large
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Advanced Settings</CardTitle>
              <CardDescription>Configure advanced application settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable Analytics</Label>
                  <p className="text-sm text-muted-foreground">Send anonymous usage data to improve the platform</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => handlePlaceholderAction('Analytics toggle')}>
                  Toggle
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Export Data</Label>
                  <p className="text-sm text-muted-foreground">Export all your data in JSON format</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => handlePlaceholderAction('Data export')}>
                  Export
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Reset Configuration</Label>
                  <p className="text-sm text-muted-foreground">Reset all settings to default values</p>
                </div>
                <Button variant="destructive" size="sm" onClick={() => handlePlaceholderAction('Reset configuration')}>
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
