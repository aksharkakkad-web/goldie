/********************************************************************************
 * Copyright (C) 2026 Akshar Kakkad and others.
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

/** General concepts only: these prepared answers make no claims about a project. */
export const generalFaq = [
    {
        question: 'What is an API?', aliases: ['What is an API?', 'Explain APIs', 'What does API mean?'],
        answer: 'An API is a contract for communication between pieces of software. It defines which requests are available, '
            + 'what inputs they accept, and what responses or errors they return. A stable contract lets each side change its '
            + 'internal implementation without requiring the other side to know those details.'
    },
    {
        question: 'What is a database transaction?', aliases: ['What is a database transaction?', 'What is a transaction?'],
        answer: 'A database transaction groups related changes into one unit. The changes either commit together or roll back together. '
            + 'This helps preserve rules such as keeping two related records consistent when a request fails partway through. '
            + 'The guarantees depend on the database and isolation level.'
    },
    {
        question: 'What is idempotency?', aliases: ['What is idempotency?', 'What does idempotent mean?'],
        answer: 'Idempotency means repeating an operation has the same intended effect as performing it once. It matters when clients '
            + 'retry after a timeout and cannot tell whether the first request succeeded. A stable request identifier can let a server '
            + 'recognize a retry and return the original result instead of repeating a change.'
    }
];

export const unsupportedQuestion = 'I can answer a small set of prepared general questions at this stage. '
    + 'I cannot yet answer arbitrary questions or verify implementation details. Your lesson phase is preserved; resume it when you are ready.';
