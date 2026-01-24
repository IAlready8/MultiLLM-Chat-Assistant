"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileDown, FileUp, AlertTriangle } from 'lucide-react';

interface ExportImportDialogProps {
  onExport: (password: string) => Promise<string>;
  onImport: (data: string, password: string) => Promise<void>;
  buttonVariant?: "default" | "outline" | "secondary";
}

export function ExportImportDialog({ 
  onExport, 
  onImport,
  buttonVariant = "outline" 
}: ExportImportDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("export");
  const [exportPassword, setExportPassword] = useState("");
  const [importPassword, setImportPassword] = useState("");
  const [importData, setImportData] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [exportedData, setExportedData] = useState("");
  
  const handleExport = async () => {
    if (!exportPassword) {
      setError("Please enter a password");
      return;
    }
    
    setIsLoading(true);
    setError("");
    
    try {
      const data = await onExport(exportPassword);
      setExportedData(data);
      
      // Create a download link
      const element = document.createElement("a");
      const file = new Blob([data], { type: "text/plain" });
      element.href = URL.createObjectURL(file);
      element.download = `multi-llm-export-${new Date().toISOString().split("T")[0]}.txt`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      
      // Reset form
      setExportPassword("");
    } catch (err) {
      setError(`Export failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleImport = async () => {
    if (!importData) {
      setError("Please enter export data");
      return;
    }
    
    if (!importPassword) {
      setError("Please enter the password");
      return;
    }
    
    setIsLoading(true);
    setError("");
    
    try {
      await onImport(importData, importPassword);
      
      // Reset form and close dialog
      setImportData("");
      setImportPassword("");
      setIsOpen(false);
    } catch (err) {
      setError(`Import failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant={buttonVariant}>
          {activeTab === "export" ? (
            <>
              <FileDown className="mr-2 h-4 w-4" />
              Export
            </>
          ) : (
            <>
              <FileUp className="mr-2 h-4 w-4" />
              Import
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-800">
        <DialogHeader>
          <DialogTitle>Export/Import Data</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="export" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="export">Export</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
          </TabsList>
          
          <TabsContent value="export" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="export-password">Password to encrypt export</Label>
              <Input
                id="export-password"
                type="password"
                placeholder="Enter a strong password"
                value={exportPassword}
                onChange={(e) => setExportPassword(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
              <p className="text-xs text-gray-500">
                You&apos;ll need this password when importing your data
              </p>
            </div>
            
            {error && activeTab === "export" && (
              <Alert className="bg-red-900/20 border-red-800">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <AlertDescription className="text-red-400">{error}</AlertDescription>
              </Alert>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleExport} disabled={isLoading}>
                {isLoading ? "Exporting..." : "Export"}
              </Button>
            </DialogFooter>
          </TabsContent>
          
          <TabsContent value="import" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="import-data">Import Data</Label>
              <Textarea
                id="import-data"
                placeholder="Paste your exported data here"
                value={importData}
                onChange={(e) => setImportData(e.target.value)}
                className="h-32 bg-gray-800 border-gray-700"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="import-password">Password</Label>
              <Input
                id="import-password"
                type="password"
                placeholder="Enter the password used for export"
                value={importPassword}
                onChange={(e) => setImportPassword(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
            </div>
            
            {error && activeTab === "import" && (
              <Alert className="bg-red-900/20 border-red-800">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <AlertDescription className="text-red-400">{error}</AlertDescription>
              </Alert>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={isLoading}>
                {isLoading ? "Importing..." : "Import"}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}