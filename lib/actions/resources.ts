'use server';

import { createClient as createBrowserClient } from '@/utils/supabase/client';
import { createEmbedding } from '../vector/embeddings';
import { edgeLogger } from '../logger/edge-logger';
import { insertResourceSchema, type NewResourceParams } from './resources.types';

export async function createResource(input: NewResourceParams) {
  try {
    const { content } = insertResourceSchema.parse(input);
    const supabase = createBrowserClient();

    // First create the resource
    const { data: resource, error: resourceError } = await supabase
      .from('documents')
      .insert({ content })
      .select()
      .single();

    if (resourceError) throw resourceError;

    // Generate embeddings for the content
    const embedding = await createEmbedding(content);

    // Insert embeddings
    const { error: embeddingError } = await supabase
      .from('embeddings')
      .insert({
        document_id: resource.id,
        content: content,
        embedding: embedding
      });

    if (embeddingError) throw embeddingError;

    edgeLogger.info('Resource created successfully', { 
      resourceId: resource.id,
      contentLength: content.length
    });

    return 'Resource successfully created and embedded.';
  } catch (error) {
    edgeLogger.error('Failed to create resource', { error });
    if (error instanceof Error) {
      return error.message.length > 0 ? error.message : 'Error creating resource';
    }
    return 'Error creating resource';
  }
} 