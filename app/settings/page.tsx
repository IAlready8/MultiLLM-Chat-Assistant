'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import ApiKeyForm from '@/components/api-key-form'
import { ExportImportDialog } from '@/components/export-import-dialog'
import { exportAllData, importAllData } from '@/services/export-import-service'
import { supportedProviderIds } from '@/lib/provider-registry'

const PROFILE_STORAGE_KEY = 'settings.profile'
const FONT_SIZE_STORAGE_KEY = 'settings.fontSize'
const ANALYTICS_STORAGE_KEY = 'settings.analyticsEnabled'
const LOCAL_PREFERENCE_KEYS = [
  'modelSettings',
  'userPreferences',
  PROFILE_STORAGE_KEY,
  FONT_SIZE_STORAGE_KEY,
  ANALYTICS_STORAGE_KEY,
]

type FontSizeOption = 'small' | 'normal' | 'large'

type ProfileSettings = {
  name: string
  email: string
}

const DEFAULT_PROFILE: ProfileSettings = {
  name: '',
  email: '',
}

const FONT_OPTIONS: Record<FontSizeOption, { label: string; scale: number }> = {
  small: { label: 'Small', scale: 0.92 },
  normal: { label: 'Normal', scale: 1 },
  large: { label: 'Large', scale: 1.08 },
}

const SUPPORTED_PROVIDER_IDS = supportedProviderIds

const isFontSizeOption = (value: string): value is FontSizeOption =>
  value === 'small' || value === 'normal' || value === 'large'

const applyFontScale = (option: FontSizeOption) => {
  if (typeof document === 'undefined') {
    return
  }
  const scale = FONT_OPTIONS[option].scale
  document.documentElement.style.fontSize = `${16 * scale}px`
}

const readProfileFromStorage = (): ProfileSettings => {
  if (typeof window === 'undefined') {
    return DEFAULT_PROFILE
  }

  const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY)
  if (!raw) {
    return DEFAULT_PROFILE
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ProfileSettings>
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      email: typeof parsed.email === 'string' ? parsed.email : '',
    }
  } catch {
    return DEFAULT_PROFILE
  }
}

const readFontSizeFromStorage = (): FontSizeOption => {
  if (typeof window === 'undefined') {
    return 'normal'
  }
  const value = window.localStorage.getItem(FONT_SIZE_STORAGE_KEY)
  return value && isFontSizeOption(value) ? value : 'normal'
}

const readAnalyticsToggle = (): boolean => {
  if (typeof window === 'undefined') {
    return true
  }
  const value = window.localStorage.getItem(ANALYTICS_STORAGE_KEY)
  return value === null ? true : value === 'true'
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<ProfileSettings>(DEFAULT_PROFILE)
  const [fontSize, setFontSize] = useState<FontSizeOption>('normal')
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const { toast } = useToast()

  const { theme, setTheme } = useTheme()

  const hydrateFromStorage = useCallback(() => {
    const savedProfile = readProfileFromStorage()
    const savedFontSize = readFontSizeFromStorage()
    const savedAnalyticsEnabled = readAnalyticsToggle()

    setProfile(savedProfile)
    setFontSize(savedFontSize)
    setAnalyticsEnabled(savedAnalyticsEnabled)
    applyFontScale(savedFontSize)
  }, [])

  useEffect(() => {
    hydrateFromStorage()
  }, [hydrateFromStorage])

  const saveProfile = async () => {
    if (!profile.email.trim().includes('@')) {
      toast({
        title: 'Invalid email',
        description: 'Please enter a valid email address.',
        variant: 'destructive',
      })
      return
    }

    setIsSavingProfile(true)
    try {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
      toast({
        title: 'Profile saved',
        description: 'Your profile settings were saved locally.',
      })
    } catch (error) {
      console.error('Failed to save profile settings:', error)
      toast({
        title: 'Save failed',
        description: 'Unable to save profile settings.',
        variant: 'destructive',
      })
    } finally {
      setIsSavingProfile(false)
    }
  }

  const selectFontSize = (option: FontSizeOption) => {
    setFontSize(option)
    applyFontScale(option)
    window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, option)
    toast({
      title: 'Appearance updated',
      description: `${FONT_OPTIONS[option].label} font size applied.`,
    })
  }

  const setAnalyticsPreference = (enabled: boolean) => {
    setAnalyticsEnabled(enabled)
    window.localStorage.setItem(ANALYTICS_STORAGE_KEY, String(enabled))
    toast({
      title: enabled ? 'Analytics enabled' : 'Analytics disabled',
      description: enabled
        ? 'Anonymous usage tracking is now enabled.'
        : 'Anonymous usage tracking is now disabled.',
    })
  }

  const handleExportData = useCallback(
    async (password: string): Promise<string> => {
      const result = await exportAllData(password)
      toast({
        title: 'Export complete',
        description: 'Your data was exported and downloaded successfully.',
      })
      return result
    },
    [toast]
  )

  const handleImportData = useCallback(
    async (data: string, password: string) => {
      await importAllData(data, password)
      hydrateFromStorage()
      toast({
        title: 'Import complete',
        description: 'Your local data has been restored.',
      })
    },
    [hydrateFromStorage, toast]
  )

  const resetConfiguration = async () => {
    const confirmed = window.confirm(
      'Reset local settings and clear saved provider keys for this account/guest?'
    )
    if (!confirmed) {
      return
    }

    setIsResetting(true)
    try {
      LOCAL_PREFERENCE_KEYS.forEach((key) => window.localStorage.removeItem(key))

      await Promise.all(
        SUPPORTED_PROVIDER_IDS.map(async (provider) => {
          const response = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, apiKey: '' }),
          })
          if (!response.ok) {
            throw new Error(`Failed to clear ${provider} configuration`)
          }
        })
      )

      setTheme('system')
      setProfile(DEFAULT_PROFILE)
      setFontSize('normal')
      setAnalyticsEnabled(true)
      applyFontScale('normal')

      toast({
        title: 'Configuration reset',
        description:
          'Local preferences were reset and provider keys were cleared.',
      })
    } catch (error) {
      console.error('Failed to reset configuration:', error)
      toast({
        title: 'Reset failed',
        description: 'Some settings could not be reset. Please retry.',
        variant: 'destructive',
      })
    } finally {
      setIsResetting(false)
    }
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

      <Tabs defaultValue="general">
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
              <Input
                id="name"
                placeholder="Your name"
                value={profile.name}
                onChange={(event) =>
                  setProfile((prev) => ({ ...prev, name: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="your.email@example.com"
                value={profile.email}
                onChange={(event) =>
                  setProfile((prev) => ({ ...prev, email: event.target.value }))
                }
              />
            </div>
            <Button type="button" onClick={saveProfile} disabled={isSavingProfile}>
              {isSavingProfile ? 'Saving...' : 'Save changes'}
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
                  <Button
                    variant={theme === 'light' ? 'default' : 'outline'}
                    onClick={() => setTheme('light')}
                  >
                    Light
                  </Button>
                  <Button
                    variant={theme === 'dark' ? 'default' : 'outline'}
                    onClick={() => setTheme('dark')}
                  >
                    Dark
                  </Button>
                  <Button
                    variant={theme === 'system' ? 'default' : 'outline'}
                    onClick={() => setTheme('system')}
                  >
                    System
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Font Size</Label>
                <div className="flex space-x-2">
                  {(
                    Object.entries(FONT_OPTIONS) as Array<
                      [FontSizeOption, { label: string; scale: number }]
                    >
                  ).map(([option, config]) => (
                    <Button
                      key={option}
                      variant={fontSize === option ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => selectFontSize(option)}
                    >
                      {config.label}
                    </Button>
                  ))}
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
                <Button
                  variant={analyticsEnabled ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAnalyticsPreference(!analyticsEnabled)}
                >
                  {analyticsEnabled ? 'Enabled' : 'Disabled'}
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Export Data</Label>
                  <p className="text-sm text-muted-foreground">Export/import local workspace data with encryption (API keys excluded)</p>
                </div>
                <ExportImportDialog
                  onExport={handleExportData}
                  onImport={handleImportData}
                  buttonVariant="outline"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Reset Configuration</Label>
                  <p className="text-sm text-muted-foreground">Reset all settings to default values</p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={resetConfiguration}
                  disabled={isResetting}
                >
                  {isResetting ? 'Resetting...' : 'Reset'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
