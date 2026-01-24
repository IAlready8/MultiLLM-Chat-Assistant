"use client";

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Save, Trash2, Clock } from 'lucide-react';
import { useConversation } from '@/hooks/use-conversation';
import { formatTimestamp } from '@/lib/utils';

interface ConversationManagerProps {
  type: 'multi-chat' | 'goal-hub' | 'comparison' | 'pipeline';
  data: any;
  onLoad: (data: any) => void;
  buttonVariant?: "default" | "outline" | "secondary";
}

export function ConversationManager({
  type,
  data,
  onLoad,
  buttonVariant = "outline"
}: ConversationManagerProps) {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [conversationTitle, setConversationTitle] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const {
    conversationList,
    isLoadingList,
    createConversation,
    deleteConversation,
    loadConversation,
    activeConversation
  } = useConversation();

  const handleSave = async () => {
    if (!conversationTitle.trim()) return;

    try {
      // Create a conversation with the current data as a message
      await createConversation(conversationTitle, [
        {
          role: 'user' as const,
          content: JSON.stringify({ type, data }),
          provider: null,
          model: null,
        }
      ]);
      setShowSaveDialog(false);
      setConversationTitle("");
    } catch (error) {
      console.error("Error saving conversation:", error);
    }
  };

  const handleLoad = async (id: string) => {
    try {
      await loadConversation(id);
    } catch (error) {
      console.error("Error loading conversation:", error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteConversation(id);
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error("Error deleting conversation:", error);
    }
  };

  // Filter conversations by type if stored in message content
  const filteredConversations = conversationList;

  return (
    <div className="flex gap-2">
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogTrigger asChild>
          <Button variant={buttonVariant} className="flex items-center gap-1">
            <Save className="h-4 w-4" />
            Save
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-gray-900 border-gray-800">
          <DialogHeader>
            <DialogTitle>Save Conversation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="conversation-title">Conversation Title</Label>
              <Input
                id="conversation-title"
                placeholder="Enter a title for this conversation"
                value={conversationTitle}
                onChange={(e) => setConversationTitle(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSaveDialog(false)}>Cancel</Button>
              <Button onClick={handleSave}>Save</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={buttonVariant}>Load</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="bg-gray-900 border-gray-800">
          {isLoadingList ? (
            <DropdownMenuItem disabled>Loading...</DropdownMenuItem>
          ) : filteredConversations.length > 0 ? (
            filteredConversations.map((conv) => (
              <DropdownMenuItem
                key={conv.id}
                onClick={() => handleLoad(conv.id)}
                className="flex flex-col items-start"
              >
                <span className="font-medium">{conv.title}</span>
                <span className="text-xs text-gray-400 flex items-center mt-1">
                  <Clock className="h-3 w-3 mr-1" />
                  {formatTimestamp(conv.updatedAt)}
                </span>
                <DropdownMenuSeparator />
                <div className="flex w-full justify-end mt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteConfirm(conv.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </div>
              </DropdownMenuItem>
            ))
          ) : (
            <DropdownMenuItem disabled>No saved conversations</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <DialogContent className="bg-gray-900 border-gray-800">
          <DialogHeader>
            <DialogTitle>Delete Conversation</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>Are you sure you want to delete this conversation? This action cannot be undone.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => showDeleteConfirm && handleDelete(showDeleteConfirm)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
