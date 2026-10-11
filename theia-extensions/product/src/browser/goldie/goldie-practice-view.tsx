// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import * as React from '@theia/core/shared/react';
import { GoldiePractice } from './goldie-practice';

/** No service calls: user responses never leave this phase's client-only model. */
export function GoldiePracticeView({ practice, onUpdate, onContinue, continueLabel = 'Exit practice & continue lesson' }: {
    practice: GoldiePractice; onUpdate: () => void; onContinue: () => void; continueLabel?: string;
}): React.ReactElement {
    return <section className='goldie-practice-view' aria-label='Phase practice'>
        <p className='goldie-eyebrow'>OPTIONAL PRACTICE · {practice.position + 1} / {practice.questions.length}</p>
        <h3>{practice.current.question}</h3>
        <label htmlFor='goldie-practice-response'>Your reasoning</label>
        <textarea id='goldie-practice-response' rows={4} maxLength={2000} value={practice.response}
            aria-describedby='goldie-practice-count goldie-practice-privacy'
            placeholder='Try explaining it in your own words.' onChange={event => { practice.answer(event.currentTarget.value); onUpdate(); }} />
        <p id='goldie-practice-count' className='goldie-practice-count'>{practice.response.length}/2000</p>
        <p id='goldie-practice-privacy' className='goldie-practice-privacy'><span aria-hidden='true'>ⓘ</span>
            Your response stays on this device. There is no score or grading.</p>
        {!practice.modelAnswer && <button className='theia-button secondary goldie-practice-reveal'
            onClick={() => { practice.reveal(); onUpdate(); }}>Show model answer</button>}
        {practice.modelAnswer && <div className='goldie-answer' aria-live='polite'><h4>Model answer</h4><p>{practice.modelAnswer}</p></div>}
        <div className='goldie-practice-navigation'>
            <button className='theia-button secondary' disabled={practice.position === 0}
                onClick={() => { practice.move(practice.position - 1); onUpdate(); }}><span aria-hidden='true'>←</span> Previous question</button>
            <button className='theia-button goldie-practice-next' disabled={practice.position === practice.questions.length - 1}
                onClick={() => { practice.move(practice.position + 1); onUpdate(); }}>Next question <span aria-hidden='true'>→</span></button>
        </div>
        <button className='theia-button secondary goldie-practice-exit' onClick={onContinue}>{continueLabel}</button>
    </section>;
}
