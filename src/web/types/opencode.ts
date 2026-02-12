/**
 * Frontend-only OpenCode type definitions.
 *
 * These mirror the shapes produced by the @opencode-ai/sdk on the server but
 * are completely standalone — no server-side imports required.
 */

// ============================================
// Message Types
// ============================================

export interface UserMessage {
	id: string;
	sessionID: string;
	role: 'user';
	time: { created: number };
	agent: string;
	model: { providerID: string; modelID: string };
	system?: string;
	variant?: string;
}

export interface AssistantMessage {
	id: string;
	sessionID: string;
	role: 'assistant';
	time: { created: number; completed?: number };
	error?: { type: string; message?: string };
	parentID: string;
	modelID: string;
	providerID: string;
	mode: string;
	agent: string;
	cost: number;
	tokens: {
		input: number;
		output: number;
		reasoning: number;
		cache: { read: number; write: number };
	};
	finish?: string;
}

export type Message = UserMessage | AssistantMessage;

// ============================================
// Part Types
// ============================================

export interface TextPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: 'text';
	text: string;
	synthetic?: boolean;
	ignored?: boolean;
	time?: { start: number; end?: number };
}

export interface ReasoningPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: 'reasoning';
	text: string;
	time: { start: number; end?: number };
}

export interface ToolStatePending {
	status: 'pending';
	input: Record<string, unknown>;
	raw: string;
}

export interface ToolStateRunning {
	status: 'running';
	input: Record<string, unknown>;
	title?: string;
	metadata?: Record<string, unknown>;
	time: { start: number };
}

export interface ToolStateCompleted {
	status: 'completed';
	input: Record<string, unknown>;
	output: string;
	title: string;
	metadata: Record<string, unknown>;
	time: { start: number; end: number };
}

export interface ToolStateError {
	status: 'error';
	input: Record<string, unknown>;
	error: string;
	time: { start: number; end: number };
}

export type ToolState =
	| ToolStatePending
	| ToolStateRunning
	| ToolStateCompleted
	| ToolStateError;

export interface ToolPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: 'tool';
	callID: string;
	tool: string;
	state: ToolState;
	metadata?: Record<string, unknown>;
}

export interface FilePart {
	id: string;
	sessionID: string;
	messageID: string;
	type: 'file';
	mime: string;
	filename?: string;
	url: string;
}

export interface SubtaskPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: 'subtask';
	prompt: string;
	description: string;
	agent: string;
	command?: string;
}

export interface StepStartPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: 'step-start';
}

export interface StepFinishPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: 'step-finish';
	reason: string;
	cost: number;
	tokens: {
		input: number;
		output: number;
		reasoning: number;
		cache: { read: number; write: number };
	};
}

export interface AgentPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: 'agent';
	name: string;
}

export interface RetryPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: 'retry';
	attempt: number;
	error: { type: string; message?: string };
	time: { created: number };
}

export interface CompactionPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: 'compaction';
	auto: boolean;
}

export interface SnapshotPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: 'snapshot';
	snapshot: string;
}

export interface PatchPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: 'patch';
	hash: string;
	files: string[];
}

export type Part =
	| TextPart
	| ReasoningPart
	| ToolPart
	| FilePart
	| SubtaskPart
	| StepStartPart
	| StepFinishPart
	| AgentPart
	| RetryPart
	| CompactionPart
	| SnapshotPart
	| PatchPart;

// ============================================
// Session Status
// ============================================

export type SessionStatus =
	| { type: 'idle' }
	| { type: 'busy' }
	| { type: 'retry'; attempt: number; message: string; next: number };

// ============================================
// Permission Types
// ============================================

export interface PermissionRequest {
	id: string;
	sessionID: string;
	permission: string;
	patterns: string[];
	metadata: Record<string, unknown>;
	always: string[];
	tool?: { messageID: string; callID: string };
}

// ============================================
// Question Types
// ============================================

export interface QuestionOption {
	label: string;
	description: string;
}

export interface QuestionInfo {
	question: string;
	header: string;
	options: QuestionOption[];
	multiple?: boolean;
	custom?: boolean;
}

export interface QuestionRequest {
	id: string;
	sessionID: string;
	questions: QuestionInfo[];
	tool?: { messageID: string; callID: string };
}

// ============================================
// Todo Types
// ============================================

export interface Todo {
	id: string;
	content: string;
	status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
	priority: 'high' | 'medium' | 'low';
}

// ============================================
// Event Types
// ============================================

export interface EventMessageUpdated {
	type: 'message.updated';
	properties: { info: Message };
}

export interface EventMessageRemoved {
	type: 'message.removed';
	properties: { sessionID: string; messageID: string };
}

export interface EventMessagePartUpdated {
	type: 'message.part.updated';
	properties: { part: Part; delta?: string };
}

export interface EventMessagePartRemoved {
	type: 'message.part.removed';
	properties: { sessionID: string; messageID: string; partID: string };
}

export interface EventSessionStatus {
	type: 'session.status';
	properties: { sessionID: string; status: SessionStatus };
}

export interface EventSessionIdle {
	type: 'session.idle';
	properties: { sessionID: string };
}

export interface EventPermissionAsked {
	type: 'permission.asked';
	properties: PermissionRequest;
}

export interface EventPermissionReplied {
	type: 'permission.replied';
	properties: {
		sessionID: string;
		requestID: string;
		reply: 'once' | 'always' | 'reject';
	};
}

export interface EventQuestionAsked {
	type: 'question.asked';
	properties: QuestionRequest;
}

export interface EventQuestionReplied {
	type: 'question.replied';
	properties: { sessionID: string; requestID: string; answers: string[][] };
}

export interface EventQuestionRejected {
	type: 'question.rejected';
	properties: { sessionID: string; requestID: string };
}

export interface EventTodoUpdated {
	type: 'todo.updated';
	properties: { sessionID: string; todos: Todo[] };
}

export interface EventSessionError {
	type: 'session.error';
	properties: { sessionID: string; error: string };
}

export interface EventSessionUpdated {
	type: 'session.updated';
	properties: {
		info: {
			id: string;
			revert?: {
				messageID: string;
				partID?: string;
				snapshot?: string;
				diff?: string;
			};
			[key: string]: unknown;
		};
	};
}

export type ChatEvent =
	| EventMessageUpdated
	| EventMessageRemoved
	| EventMessagePartUpdated
	| EventMessagePartRemoved
	| EventSessionStatus
	| EventSessionIdle
	| EventPermissionAsked
	| EventPermissionReplied
	| EventQuestionAsked
	| EventQuestionReplied
	| EventQuestionRejected
	| EventTodoUpdated
	| EventSessionError
	| EventSessionUpdated;
