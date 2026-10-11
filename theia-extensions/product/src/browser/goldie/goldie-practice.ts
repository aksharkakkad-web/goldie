// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
export interface GoldiePracticeQuestion { readonly id: string; readonly question: string; readonly modelAnswer: string; }
/** Client-only responses. This view model has no service or persistence dependency. */
export class GoldiePractice {
    readonly questions: readonly GoldiePracticeQuestion[];
    private readonly responses = new Map<string, string>();
    private readonly revealed = new Set<string>();
    private index = 0;
    constructor(questions: readonly GoldiePracticeQuestion[]) {
        const ids = new Set<string>();
        if (questions.length < 3 || questions.length > 5) { throw new Error('Practice needs 3–5 questions.'); }
        this.questions = Object.freeze(questions.map(item => {
            if (!item || typeof item.id !== 'string' || !item.id.trim() || item.id.length > 128 || ids.has(item.id)
                || typeof item.question !== 'string' || !item.question.trim() || item.question.length > 2000
                || typeof item.modelAnswer !== 'string' || !item.modelAnswer.trim() || item.modelAnswer.length > 4000) {
                throw new Error('Invalid practice question.');
            }
            ids.add(item.id);
            return Object.freeze({ id: item.id, question: item.question, modelAnswer: item.modelAnswer });
        }));
    }
    get position(): number { return this.index; }
    get current(): GoldiePracticeQuestion { return this.questions[this.index]; }
    get response(): string { return this.responses.get(this.current.id) ?? ''; }
    get modelAnswer(): string | undefined { return this.revealed.has(this.current.id) ? this.current.modelAnswer : undefined; }
    answer(text: string): void { this.responses.set(this.current.id, text.slice(0, 2000)); }
    reveal(): void { this.revealed.add(this.current.id); }
    move(index: number): void {
        if (Number.isInteger(index) && index >= 0 && index < this.questions.length) { this.index = index; }
    }
    clear(): void { this.responses.clear(); this.revealed.clear(); this.index = 0; }
}
