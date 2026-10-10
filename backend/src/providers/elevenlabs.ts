export interface ElevenLabsCheckOptions {
    apiKey: string;
    baseUrl: string;
    timeoutMs: number;
}

export interface ElevenLabsCheckResult {
    ok: true;
}

function isTimeoutError(error: unknown): boolean {
    return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

export async function checkElevenLabsCredential(
    options: ElevenLabsCheckOptions
): Promise<ElevenLabsCheckResult> {
    const apiKey = options.apiKey.trim();
    if (!apiKey) {
        throw new Error('ELEVENLABS_API_KEY is required');
    }

    const baseUrl = options.baseUrl.replace(/\/+$/, '');
    let response: Response;
    try {
        response = await fetch(`${baseUrl}/v1/models`, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'xi-api-key': apiKey
            },
            signal: AbortSignal.timeout(options.timeoutMs)
        });
    } catch (error) {
        if (isTimeoutError(error)) {
            throw new Error('ElevenLabs credential check timed out');
        }
        throw new Error('ElevenLabs credential check could not reach the provider');
    }

    if (!response.ok) {
        throw new Error(`ElevenLabs credential check failed with status ${response.status}`);
    }

    return { ok: true };
}
