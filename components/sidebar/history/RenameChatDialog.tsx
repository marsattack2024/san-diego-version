'use client';

import React, { useEffect, useRef } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface RenameChatDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    onCancel: () => void;
    isRenaming: boolean;
    value: string; // Current title value
    onValueChange: (newValue: string) => void; // Callback to update title in controlling hook
}

export function RenameChatDialog({
    open,
    onOpenChange,
    onConfirm,
    onCancel,
    isRenaming,
    value,
    onValueChange
}: RenameChatDialogProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-focus the input when the dialog opens
    useEffect(() => {
        if (open) {
            // Timeout needed to allow dialog animation to finish before focusing
            const timer = setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select(); // Select existing text
            }, 100); // Adjust timing if needed
            return () => clearTimeout(timer);
        }
    }, [open]);

    // Handle Enter key press in input
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            // Prevent default form submission if applicable
            e.preventDefault();
            if (!isRenaming && value.trim()) {
                onConfirm();
            }
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="sm:max-w-md"
                onEscapeKeyDown={onCancel} // Allow Esc key to cancel
                onInteractOutside={(e) => {
                    // Prevent closing via clicking outside if renaming
                    if (isRenaming) {
                        e.preventDefault();
                    }
                }}
            >
                <DialogHeader>
                    <DialogTitle>Rename Conversation</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2 pt-4">
                    <Input
                        ref={inputRef}
                        type="text"
                        placeholder="Enter a new title"
                        value={value}
                        onChange={(e) => onValueChange(e.target.value)}
                        className="w-full"
                        disabled={isRenaming}
                        onKeyDown={handleKeyDown}
                    />
                </div>
                <DialogFooter>
                    <Button variant="secondary" onClick={onCancel} disabled={isRenaming}>
                        Cancel
                    </Button>
                    <Button
                        onClick={onConfirm}
                        disabled={!value.trim() || isRenaming}
                    >
                        {isRenaming ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            'Save'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
} 