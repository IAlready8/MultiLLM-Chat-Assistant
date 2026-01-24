import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-[calc(100vh-64px)] py-8">
      {/* Enhanced ambient accents */}
      <div className="ambient-orb ambient-orb--left" aria-hidden="true" />
      <div className="ambient-orb ambient-orb--right" aria-hidden="true" />

      <div className="text-center mb-10 px-4">
        <h1 className="heading-underline text-4xl md:text-5xl font-bold mb-6">MultiLLM Chat Assistant</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Your professional tool for interacting with multiple LLM APIs
        </p>
      </div>
      
      <div className="mb-10">
        <Link 
          href="/settings" 
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground px-4 py-2 rounded-full border border-border bg-card/60 backdrop-blur-sm smooth-transition"
        >
          <span className="mr-2 h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
          New: OpenRouter free models now available
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-2">
            <path d="M5 12h14"/>
            <path d="m12 5 7 7-7 7"/>
          </svg>
        </Link>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-7xl px-4">
        <Card className="flex flex-col glass-card rainbow-outline-hover smooth-transition hover:-translate-y-1">
          <CardHeader>
            <div className="bg-primary/10 p-3 rounded-lg w-fit mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 19-7-7 7-7"/>
                <path d="M19 12H5"/>
              </svg>
            </div>
            <CardTitle>Start New Chat</CardTitle>
            <CardDescription>Begin a new conversation with your chosen LLM.</CardDescription>
          </CardHeader>
          <CardContent className="flex-grow flex items-end">
            <Link href="/multi-chat" passHref>
              <Button className="w-full glass-button">Go to Multi-Chat</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="flex flex-col glass-card rainbow-outline-hover smooth-transition hover:-translate-y-1">
          <CardHeader>
            <div className="bg-primary/10 p-3 rounded-lg w-fit mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 12h8"/>
                <path d="M12 8v8"/>
                <circle cx="12" cy="12" r="9"/>
              </svg>
            </div>
            <CardTitle>AI Roundtable</CardTitle>
            <CardDescription>Let multiple models debate a goal while you observe.</CardDescription>
          </CardHeader>
          <CardContent className="flex-grow flex items-end">
            <Link href="/ai-roundtable" passHref>
              <Button className="w-full glass-button">Open Roundtable</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="flex flex-col glass-card rainbow-outline-hover smooth-transition hover:-translate-y-1">
          <CardHeader>
            <div className="bg-primary/10 p-3 rounded-lg w-fit mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18"/>
                <path d="m19 9-5 5-4-4-3 3"/>
              </svg>
            </div>
            <CardTitle>View Analytics</CardTitle>
            <CardDescription>See your usage statistics and model comparisons.</CardDescription>
          </CardHeader>
          <CardContent className="flex-grow flex items-end">
            <Link href="/analytics" passHref>
              <Button className="w-full glass-button">View Analytics</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="flex flex-col glass-card rainbow-outline-hover smooth-transition hover:-translate-y-1">
          <CardHeader>
            <div className="bg-primary/10 p-3 rounded-lg w-fit mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
            <CardTitle>Configure Settings</CardTitle>
            <CardDescription>Manage your API keys and application preferences.</CardDescription>
          </CardHeader>
          <CardContent className="flex-grow flex items-end">
            <Link href="/settings" passHref>
              <Button className="w-full glass-button">Go to Settings</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
