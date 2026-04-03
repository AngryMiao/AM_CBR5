export type SessionRouteLogState = {
  routeSessionId: string
  loadedSessionId: string
  singletonKey: string
  messageCount: number
  lastMessageId: string
  lastMessageRole: string
  lastMessageTextLength: number
  lastMessageGenerating: boolean
  isFetching: boolean
}

export function buildSessionRouteSnapshot(state: SessionRouteLogState) {
  return [
    state.routeSessionId,
    state.loadedSessionId,
    state.singletonKey,
    state.messageCount,
    state.lastMessageId,
    state.lastMessageRole,
    state.lastMessageGenerating ? '1' : '0',
    state.isFetching ? '1' : '0',
  ].join('|')
}

export function buildSessionRouteLogMessage(state: SessionRouteLogState) {
  return `[session-route] routeSessionId=${state.routeSessionId} loadedSessionId=${state.loadedSessionId} singletonKey=${state.singletonKey} messageCount=${state.messageCount} lastMessageId=${state.lastMessageId} lastMessageRole=${state.lastMessageRole} lastMessageTextLength=${state.lastMessageTextLength} lastMessageGenerating=${state.lastMessageGenerating} isFetching=${state.isFetching}`
}
