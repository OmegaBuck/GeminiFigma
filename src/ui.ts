// DOM Elements
let btnSelect: HTMLButtonElement;
let btnAnalyze: HTMLButtonElement;
let apiKeyInput: HTMLInputElement;
let userPrompt: HTMLTextAreaElement;
let framePreview: HTMLImageElement;
let statusText: HTMLDivElement;
let promptArea: HTMLDivElement;
let responseArea: HTMLDivElement;

let capturedImageData: Uint8Array | null = null;

function init() {
    btnSelect = document.getElementById('btn-select') as HTMLButtonElement;
    btnAnalyze = document.getElementById('btn-analyze') as HTMLButtonElement;
    apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
    userPrompt = document.getElementById('user-prompt') as HTMLTextAreaElement;
    framePreview = document.getElementById('frame-preview') as HTMLImageElement;
    statusText = document.getElementById('status-text') as HTMLDivElement;
    promptArea = document.getElementById('prompt-area') as HTMLDivElement;
    responseArea = document.getElementById('response-area') as HTMLDivElement;

    if (!btnSelect || !btnAnalyze || !apiKeyInput) {
        console.error('Failed to find vital UI elements. UI state might be broken.');
        return;
    }

    // Initialize: Load API key if saved
    console.log('UI Initialized - requesting settings');
    parent.postMessage({ pluginMessage: { type: 'load-settings' } }, '*');

    apiKeyInput.onchange = () => {
        parent.postMessage({ pluginMessage: { type: 'save-settings', apiKey: apiKeyInput.value } }, '*');
    };

    btnSelect.onclick = () => {
        console.log('Select Frame button clicked');
        parent.postMessage({ pluginMessage: { type: 'analyze-frame' } }, '*');
        statusText.textContent = 'Capturing frame...';
    };

    btnAnalyze.onclick = async () => {
        const apiKey = apiKeyInput.value.trim();
        const prompt = userPrompt.value.trim();

        if (!apiKey) {
            statusText.textContent = 'Error: Please enter an API key.';
            return;
        }

        if (!capturedImageData) {
            statusText.textContent = 'Error: Please select a frame first.';
            return;
        }

        statusText.innerHTML = 'Thinking<span class="loading-pulse"></span>';
        btnAnalyze.disabled = true;
        responseArea.style.display = 'none';

        try {
            const response = await callGeminiAPI(apiKey, prompt, capturedImageData);
            displayResponse(response);
        } catch (error: any) {
            console.error('Gemini API Error:', error);
            statusText.textContent = `Error: ${error.message}`;
        } finally {
            btnAnalyze.disabled = false;
        }
    };
}

window.onmessage = (event) => {
    const msg = event.data.pluginMessage;
    if (!msg) return;

    console.log('UI received message:', msg.type);

    if (msg.type === 'frame-captured') {
        capturedImageData = msg.imageData;
        try {
            const blob = new Blob([capturedImageData as any], { type: 'image/png' });
            const url = URL.createObjectURL(blob);

            framePreview.src = url;
            framePreview.style.display = 'block';
            promptArea.style.display = 'block';
            statusText.textContent = `Captured: ${msg.frameName}`;
        } catch (e) {
            console.error('Failed to process image blob:', e);
            statusText.textContent = 'Error: Failed to process frame image.';
        }
    }

    if (msg.type === 'settings-loaded') {
        if (msg.apiKey && apiKeyInput) {
            apiKeyInput.value = msg.apiKey;
        }
    }
};

async function callGeminiAPI(apiKey: string, prompt: string, imageBytes: Uint8Array) {
    const base64Image = btoa(
        new Uint8Array(imageBytes).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    const systemInstructions = `You are a Senior Product Designer and UX Researcher. 
    Analyze the provided design based on UX/UI research and theories (e.g., Gestalt Laws, Fitts's Law, Nielsen's Heuristics). 
    Provide actionable feedback and creative ideas for improvements. 
    Ground your suggestions in established design principles.`;

    const requestBody = {
        contents: [
            {
                parts: [
                    { text: `${systemInstructions}\n\nUser Question/Goal: ${prompt || 'Please analyze this design and suggest improvements.'}` },
                    {
                        inline_data: {
                            mime_type: 'image/png',
                            data: base64Image
                        }
                    }
                ]
            }
        ]
    };

    // Use v1 endpoint with gemini-2.5-flash (replacement for 1.5-flash in 2026)
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;



    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: { message: 'Network response was not ok' } }));
        throw new Error(err.error?.message || `API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

function displayResponse(text: string) {
    statusText.textContent = 'Analysis Complete.';
    // Simple markdown-ish rendering
    responseArea.innerHTML = text
        .replace(/\n\n/g, '<p></p>')
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
    responseArea.style.display = 'block';
}

// Start the app when the DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
