import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { HelpCircle, Check, ChevronRight, Pencil } from 'lucide-react';
import type { QuestionRequest, QuestionInfo } from '../../types/opencode';

interface QuestionCardProps {
	request: QuestionRequest;
	sessionId: string;
}

/** Per-question answer state: selected option labels and/or custom text */
interface QuestionAnswer {
	selected: string[];
	customText: string;
	useCustom: boolean;
}

function emptyAnswer(): QuestionAnswer {
	return { selected: [], customText: '', useCustom: false };
}

export function QuestionCard({ request, sessionId }: QuestionCardProps) {
	const questions = request.questions;
	const isSingle = questions.length === 1;

	const [activeTab, setActiveTab] = useState(0);
	const [answers, setAnswers] = useState<QuestionAnswer[]>(() =>
		questions.map(() => emptyAnswer()),
	);
	const [replying, setReplying] = useState(false);
	const [replied, setReplied] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const isConfirmTab = activeTab === questions.length;

	/** Whether a question has a valid answer */
	const isAnswered = useCallback(
		(idx: number) => {
			const a = answers[idx];
			if (!a) return false;
			if (a.useCustom) return a.customText.trim().length > 0;
			return a.selected.length > 0;
		},
		[answers],
	);

	const allAnswered = useMemo(
		() => questions.every((_, i) => isAnswered(i)),
		[questions, isAnswered],
	);

	/** Toggle an option for a question (supports multiple if question.multiple) */
	const toggleOption = useCallback(
		(qi: number, label: string) => {
			setAnswers((prev) => {
				const next = [...prev];
				const existing = next[qi];
				if (!existing) return prev;
				const cur: QuestionAnswer = {
					selected: [...existing.selected],
					customText: existing.customText,
					useCustom: false,
				};
				const q = questions[qi];
				if (q?.multiple) {
					cur.selected = cur.selected.includes(label)
						? cur.selected.filter((s) => s !== label)
						: [...cur.selected, label];
				} else {
					cur.selected = [label];
				}
				next[qi] = cur;
				return next;
			});

			// Auto-advance after short delay (only for single-select)
			const q = questions[qi];
			if (q && !q.multiple) {
				setTimeout(() => {
					setActiveTab((prev) => {
						const nextTab = prev + 1;
						if (nextTab < questions.length) return nextTab;
						return questions.length; // Confirm tab
					});
				}, 250);
			}
		},
		[questions],
	);

	/** Switch to custom input mode for a question */
	const enableCustom = useCallback((qi: number) => {
		setAnswers((prev) => {
			const next = [...prev];
			const existing = next[qi] ?? emptyAnswer();
			next[qi] = { selected: [], customText: existing.customText, useCustom: true };
			return next;
		});
	}, []);

	/** Cancel custom input mode — revert to option selection */
	const cancelCustom = useCallback((qi: number) => {
		setAnswers((prev) => {
			const next = [...prev];
			const existing = next[qi] ?? emptyAnswer();
			next[qi] = { selected: existing.selected, customText: '', useCustom: false };
			return next;
		});
	}, []);

	/** Update custom text for a question */
	const setCustomText = useCallback((qi: number, text: string) => {
		setAnswers((prev) => {
			const next = [...prev];
			const existing = next[qi] ?? emptyAnswer();
			next[qi] = { selected: existing.selected, customText: text, useCustom: existing.useCustom };
			return next;
		});
	}, []);

	/** Build the answers array and submit */
	const handleSubmit = async () => {
		if (!allAnswered) return;
		setReplying(true);
		setError(null);

		const payload: string[][] = answers.map((a) => {
			if (a.useCustom) return [a.customText.trim()];
			return [...a.selected];
		});

		try {
			const res = await fetch(
				`/api/sessions/${sessionId}/questions/${request.id}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ answers: payload }),
				},
			);
			if (!res.ok) {
				const detail = await res.text().catch(() => '');
				setError(
					detail
						? `Failed to send answer: ${detail}`
						: 'Failed to send answer. Try again.',
				);
				return;
			}
			setReplied(true);
		} catch {
			setError('Network error. Try again.');
		} finally {
			setReplying(false);
		}
	};

	/** Get the display answer for the confirm summary */
	const getDisplayAnswer = (qi: number): string => {
		const a = answers[qi];
		if (!a) return '—';
		if (a.useCustom) return a.customText.trim() || '—';
		return a.selected.length > 0 ? a.selected.join(', ') : '—';
	};

	if (replied) return null;

	return (
		<div className="rounded-lg border border-blue-500/30 bg-blue-500/5 overflow-hidden">
			{/* Header */}
			<div className="flex items-center gap-2 px-4 pt-3 pb-2">
				<HelpCircle className="h-4 w-4 text-blue-500 shrink-0" />
				<span className="text-xs uppercase tracking-wide text-blue-500 font-medium">
					Question
				</span>
			</div>

			{/* Tab Bar — hidden for single question */}
			{!isSingle && (
				<div className="flex items-center gap-0.5 px-3 overflow-x-auto scrollbar-none border-b border-[var(--border)]/40">
					{questions.map((q, i) => {
						const active = activeTab === i;
						const answered = isAnswered(i);
						return (
							<button
								key={`tab-${request.id}-${i}`}
								type="button"
								onClick={() => setActiveTab(i)}
								className={`
									relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap
									transition-colors cursor-pointer
									${active
										? 'text-blue-400'
										: answered
											? 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
											: 'text-[var(--muted-foreground)]/60 hover:text-[var(--muted-foreground)]'
									}
								`}
							>
								{answered && !active && (
									<Check className="h-3 w-3 text-emerald-400 shrink-0" />
								)}
								<span className="truncate max-w-[120px]">{q.header}</span>
								{active && (
									<span className="absolute bottom-0 left-1 right-1 h-0.5 bg-blue-400 rounded-full" />
								)}
							</button>
						);
					})}
					{/* Confirm Tab */}
					<button
						type="button"
						onClick={() => setActiveTab(questions.length)}
						className={`
							relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap
							transition-colors cursor-pointer
							${isConfirmTab
								? 'text-blue-400'
								: allAnswered
									? 'text-emerald-400 hover:text-emerald-300'
									: 'text-[var(--muted-foreground)]/40'
							}
						`}
					>
						<Check className="h-3 w-3 shrink-0" />
						<span>Confirm</span>
						{isConfirmTab && (
							<span className="absolute bottom-0 left-1 right-1 h-0.5 bg-blue-400 rounded-full" />
						)}
					</button>
				</div>
			)}

			{/* Content Area */}
			<div className="p-4">
				{!isConfirmTab && questions[activeTab] && answers[activeTab] ? (
					<QuestionPanel
						question={questions[activeTab]}
						answer={answers[activeTab]}
						questionIndex={activeTab}
						toggleOption={toggleOption}
						enableCustom={enableCustom}
						cancelCustom={cancelCustom}
						setCustomText={setCustomText}
						disabled={replying}
					/>
				) : (
					<ConfirmPanel
						questions={questions}
						answers={answers}
						getDisplayAnswer={getDisplayAnswer}
						isAnswered={isAnswered}
						allAnswered={allAnswered}
						replying={replying}
						onSubmit={handleSubmit}
						onNavigate={setActiveTab}
					/>
				)}

				{error && <div className="text-xs text-red-400 mt-3">{error}</div>}

				{/* For single-question mode: inline confirm */}
				{isSingle && !isConfirmTab && isAnswered(0) && (
					<div className="mt-4 pt-3 border-t border-[var(--border)]/40">
						<div className="flex items-center justify-between">
							<div className="text-xs text-[var(--muted-foreground)]">
								<span className="text-[var(--foreground)] font-medium">
									{getDisplayAnswer(0)}
								</span>
							</div>
							<button
								type="button"
								onClick={handleSubmit}
								disabled={replying || !allAnswered}
								className="
									flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-md
									bg-blue-500 text-white
									hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed
									transition-colors cursor-pointer
								"
							>
								{replying ? 'Submitting…' : 'Submit'}
								{!replying && <ChevronRight className="h-3 w-3" />}
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Question Panel — shows one question at a time
// ---------------------------------------------------------------------------

function QuestionPanel({
	question,
	answer,
	questionIndex,
	toggleOption,
	enableCustom,
	cancelCustom,
	setCustomText,
	disabled,
}: {
	question: QuestionInfo;
	answer: QuestionAnswer;
	questionIndex: number;
	toggleOption: (qi: number, label: string) => void;
	enableCustom: (qi: number) => void;
	cancelCustom: (qi: number) => void;
	setCustomText: (qi: number, text: string) => void;
	disabled: boolean;
}) {
	const allowCustom = question.custom !== false;
	const customInputRef = useRef<HTMLInputElement>(null);

	// Focus custom input when switching to custom mode
	useEffect(() => {
		if (answer.useCustom && customInputRef.current) {
			customInputRef.current.focus();
		}
	}, [answer.useCustom]);

	return (
		<div>
			{/* Header & description */}
			<div className="mb-3">
				<h3 className="text-sm font-semibold text-[var(--foreground)]">
					{question.header}
				</h3>
				{question.question && (
					<p className="text-xs text-[var(--muted-foreground)] mt-1 leading-relaxed">
						{question.question}
					</p>
				)}
			</div>

			{/* Options list */}
			<div className="space-y-1.5">
				{question.options.map((opt, oi) => {
					const isSelected =
						!answer.useCustom && answer.selected.includes(opt.label);
					return (
						<button
							key={`opt-${questionIndex}-${opt.label}`}
							type="button"
							onClick={() => toggleOption(questionIndex, opt.label)}
							disabled={disabled}
							className={`
								w-full text-left px-3 py-2.5 rounded-md transition-all cursor-pointer
								flex items-start gap-3 group
								${isSelected
									? 'bg-blue-500/15 border border-blue-500/40'
									: 'bg-[var(--muted)]/30 border border-transparent hover:bg-[var(--muted)]/60 hover:border-[var(--border)]/40'
								}
								disabled:opacity-40 disabled:cursor-not-allowed
							`}
						>
							{/* Number badge */}
							<span
								className={`
									shrink-0 flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold mt-0.5
									${isSelected
										? 'bg-blue-500/30 text-blue-300'
										: 'bg-[var(--muted)]/60 text-[var(--muted-foreground)]'
									}
								`}
							>
								{oi + 1}
							</span>
							<div className="min-w-0 flex-1">
								<div
									className={`text-xs font-medium ${isSelected ? 'text-blue-300' : 'text-[var(--foreground)]'}`}
								>
									{opt.label}
								</div>
								{opt.description && (
									<div className="text-[11px] text-[var(--muted-foreground)] mt-0.5 leading-relaxed">
										{opt.description}
									</div>
								)}
							</div>
							{isSelected && (
								<Check className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
							)}
						</button>
					);
				})}

				{/* Custom input option */}
				{allowCustom && (
					<div>
						{!answer.useCustom ? (
							<button
								type="button"
								onClick={() => enableCustom(questionIndex)}
								disabled={disabled}
								className="
									w-full text-left px-3 py-2.5 rounded-md transition-all cursor-pointer
									flex items-center gap-3
									bg-[var(--muted)]/20 border border-dashed border-[var(--border)]/40
									hover:bg-[var(--muted)]/40 hover:border-[var(--border)]/60
									disabled:opacity-40 disabled:cursor-not-allowed
								"
							>
								<Pencil className="h-3.5 w-3.5 text-[var(--muted-foreground)] shrink-0" />
								<span className="text-xs text-[var(--muted-foreground)]">
									Type your own answer
								</span>
							</button>
						) : (
							<div className="rounded-md border border-blue-500/40 bg-blue-500/10 p-3">
								<div className="flex items-center gap-2 mb-2">
									<Pencil className="h-3 w-3 text-blue-400" />
									<span className="text-[11px] text-blue-400 font-medium">
										Custom answer
									</span>
									<button
										type="button"
										onClick={() => cancelCustom(questionIndex)}
										className="ml-auto text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
									>
										Cancel
									</button>
								</div>
								<input
									ref={customInputRef}
									type="text"
									placeholder="Enter your answer…"
									value={answer.customText}
									onChange={(e) =>
										setCustomText(questionIndex, e.target.value)
									}
									onKeyDown={(e) => {
										if (e.key === 'Escape') {
											cancelCustom(questionIndex);
										}
									}}
									disabled={disabled}
									className="
										w-full rounded-md border border-[var(--border)]/60 bg-[var(--background)]
										px-3 py-2 text-xs text-[var(--foreground)]
										placeholder:text-[var(--muted-foreground)]/60
										focus:outline-none focus:border-blue-500/60
									"
								/>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Confirm Panel — summary of all answers
// ---------------------------------------------------------------------------

function ConfirmPanel({
	questions,
	answers,
	getDisplayAnswer,
	isAnswered,
	allAnswered,
	replying,
	onSubmit,
	onNavigate,
}: {
	questions: QuestionInfo[];
	answers: QuestionAnswer[];
	getDisplayAnswer: (qi: number) => string;
	isAnswered: (idx: number) => boolean;
	allAnswered: boolean;
	replying: boolean;
	onSubmit: () => void;
	onNavigate: (tab: number) => void;
}) {
	return (
		<div>
			<h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">
				Review &amp; Submit
			</h3>

			<div className="space-y-2 mb-4">
				{questions.map((q, i) => {
					const answered = isAnswered(i);
					const display = getDisplayAnswer(i);
					return (
						<button
							key={`confirm-${q.header}`}
							type="button"
							onClick={() => onNavigate(i)}
							className="
								w-full text-left px-3 py-2.5 rounded-md transition-colors cursor-pointer
								flex items-center gap-3
								bg-[var(--muted)]/30 border border-[var(--border)]/30
								hover:bg-[var(--muted)]/50
							"
						>
							<span
								className={`
									shrink-0 flex items-center justify-center w-5 h-5 rounded-full text-[10px]
									${answered
										? 'bg-emerald-500/20 text-emerald-400'
										: 'bg-amber-500/20 text-amber-400'
									}
								`}
							>
								{answered ? (
									<Check className="h-3 w-3" />
								) : (
									<span>?</span>
								)}
							</span>
							<div className="min-w-0 flex-1">
								<div className="text-xs font-medium text-[var(--foreground)]">
									{q.header}
								</div>
								<div
									className={`text-[11px] mt-0.5 truncate ${
										answered
											? 'text-emerald-400/80'
											: 'text-amber-400/80'
									}`}
								>
									{answered ? display : 'Not answered'}
								</div>
							</div>
							<ChevronRight className="h-3.5 w-3.5 text-[var(--muted-foreground)] shrink-0" />
						</button>
					);
				})}
			</div>

			{!allAnswered && (
				<p className="text-[11px] text-amber-400/80 mb-3">
					Please answer all questions before submitting.
				</p>
			)}

			<button
				type="button"
				onClick={onSubmit}
				disabled={replying || !allAnswered}
				className="
					w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md
					bg-blue-500 text-white
					hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed
					transition-colors cursor-pointer
				"
			>
				{replying ? (
					'Submitting…'
				) : (
					<>
						<Check className="h-4 w-4" />
						Submit All
					</>
				)}
			</button>
		</div>
	);
}
