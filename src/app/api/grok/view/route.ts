import { llmImageViewHandlers } from '@/lib/llm/image-routes';

const handlers = llmImageViewHandlers('grok');

export const runtime = 'nodejs';
export const maxDuration = 60;
export const GET = handlers.GET;
export const POST = handlers.POST;
