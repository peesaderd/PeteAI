const DIFY_API_KEY = process.env.DIFY_API_KEY
const DIFY_BASE_URL = process.env.NEXT_PUBLIC_DIFY_URL || 'https://api.dify.ai/v1'

export interface DifyMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface DifyCompletionResponse {
  event: string
  task_id: string
  id: string
  created_at: number
  answer: string
}

export interface DifyChatResponse {
  id: string
  name: string
  messages: DifyMessage[]
  created_at: number
  updated_at: number
}

export async function createChatSession(appId: string): Promise<DifyChatResponse> {
  const response = await fetch(`${DIFY_BASE_URL}/apps/${appId}/conversation`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DIFY_API_KEY}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('Failed to create chat session')
  }

  return response.json()
}

export async function sendMessage(
  appId: string,
  query: string,
  userId: string,
  conversationId?: string
): Promise<AsyncIterable<DifyCompletionResponse>> {
  const response = await fetch(`${DIFY_BASE_URL}/chat-messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DIFY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: {},
      query,
      response_mode: 'streaming',
      user: userId,
      conversation_id: conversationId,
    }),
  })

  if (!response.ok) {
    throw new Error('Failed to send message')
  }

  return response.json()
}

export async function getConversationMessages(
  appId: string,
  conversationId: string,
  userId: string
): Promise<DifyMessage[]> {
  const response = await fetch(
    `${DIFY_BASE_URL}/apps/${appId}/conversations/${conversationId}/messages?user=${userId}`,
    {
      headers: {
        'Authorization': `Bearer ${DIFY_API_KEY}`,
      },
    }
  )

  if (!response.ok) {
    throw new Error('Failed to get messages')
  }

  const data = await response.json()
  return data.data || []
}

export async function uploadDocument(
  appId: string,
  file: File,
  documentId?: string
): Promise<{ document_id: string }> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('indexing_technique', 'high_quality')
  formData.append('process_rule', JSON.stringify({
    mode: 'automatic',
    rules: {}
  }))

  if (documentId) {
    formData.append('document_id', documentId)
  }

  const response = await fetch(`${DIFY_BASE_URL}/datasets/${appId}/documents`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DIFY_API_KEY}`,
    },
    body: formData,
  })

  if (!response.ok) {
    throw new Error('Failed to upload document')
  }

  return response.json()
}