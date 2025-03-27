import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { v4 as uuidv4 } from 'uuid';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateUUID() {
  return uuidv4();
}

export async function fetcher(url: string) {
  // Add credentials to ensure cookies are sent with the request
  const res = await fetch(url, {
    credentials: 'same-origin' // Ensures cookies are sent with the request
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    console.error(`Fetch error (${res.status}): ${errorText}`);
    throw new Error(`Error ${res.status}: ${errorText}`);
  }

  return res.json();
}

export function getDocumentTimestampByIndex(documents: any[], index: number) {
  if (!documents || documents.length === 0 || index < 0 || index >= documents.length) {
    return null;
  }

  const document = documents[index];
  return document?.createdAt ? new Date(document.createdAt) : null;
}

export function sanitizeUIMessages(messages: any[]) {
  if (!messages || messages.length === 0) {
    return [];
  }

  return messages.map(message => {
    // Remove any sensitive or unnecessary data
    const { content, role, id, createdAt } = message;
    return { content, role, id, createdAt };
  });
}

