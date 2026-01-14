// DOM Elements
let btnSelect: HTMLButtonElement;
let btnAnalyze: HTMLButtonElement;
let apiKeyInput: HTMLInputElement;
let userPrompt: HTMLTextAreaElement;
let previewContainer: HTMLDivElement;
let statusText: HTMLDivElement;
let promptArea: HTMLDivElement;
let responseArea: HTMLDivElement;

// Tab Elements
let tabAnalyze: HTMLButtonElement;
let tabSettings: HTMLButtonElement;
let viewAnalyze: HTMLDivElement;
let viewSettings: HTMLDivElement;

interface CapturedFrame {
    name: string;
    imageData: Uint8Array;
}

let capturedFrames: CapturedFrame[] = [];

function init() {
    // Buttons
    btnSelect = document.getElementById('btn-select') as HTMLButtonElement;
    btnAnalyze = document.getElementById('btn-analyze') as HTMLButtonElement;

    // Inputs
    apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
    userPrompt = document.getElementById('user-prompt') as HTMLTextAreaElement;

    // UI Display
    previewContainer = document.getElementById('preview-container') as HTMLDivElement;
    statusText = document.getElementById('status-text') as HTMLDivElement;
    promptArea = document.getElementById('prompt-area') as HTMLDivElement;
    responseArea = document.getElementById('response-area') as HTMLDivElement;

    // Tabs
    tabAnalyze = document.getElementById('tab-analyze') as HTMLButtonElement;
    tabSettings = document.getElementById('tab-settings') as HTMLButtonElement;
    viewAnalyze = document.getElementById('view-analyze') as HTMLDivElement;
    viewSettings = document.getElementById('view-settings') as HTMLDivElement;

    if (!btnSelect || !btnAnalyze || !apiKeyInput || !tabAnalyze || !tabSettings) {
        console.error('Failed to find vital UI elements.');
        return;
    }

    // Tab Logic
    tabAnalyze.onclick = () => switchTab('analyze');
    tabSettings.onclick = () => switchTab('settings');

    // Initialize: Load API key if saved
    parent.postMessage({ pluginMessage: { type: 'load-settings' } }, '*');

    apiKeyInput.onchange = () => {
        parent.postMessage({ pluginMessage: { type: 'save-settings', apiKey: apiKeyInput.value } }, '*');
    };

    btnSelect.onclick = () => {
        parent.postMessage({ pluginMessage: { type: 'analyze-frame' } }, '*');
        statusText.textContent = 'Capturing frames...';
    };

    btnAnalyze.onclick = async () => {
        const apiKey = apiKeyInput.value.trim();
        const prompt = userPrompt.value.trim();

        if (!apiKey) {
            statusText.textContent = 'Error: No API key found. Go to Settings.';
            switchTab('settings');
            return;
        }

        if (capturedFrames.length === 0) {
            statusText.textContent = 'Error: Please select at least one frame.';
            return;
        }

        statusText.innerHTML = 'Thinking<span class="loading-pulse"></span>';
        btnAnalyze.disabled = true;
        responseArea.style.display = 'none';

        try {
            const response = await callGeminiAPI(apiKey, prompt, capturedFrames);
            displayResponse(response);
        } catch (error: any) {
            console.error('Gemini API Error:', error);
            statusText.textContent = `Error: ${error.message}`;
        } finally {
            btnAnalyze.disabled = false;
        }
    };
}

function switchTab(tab: 'analyze' | 'settings') {
    if (tab === 'analyze') {
        tabAnalyze.classList.add('active');
        tabSettings.classList.remove('active');
        viewAnalyze.classList.add('active');
        viewSettings.classList.remove('active');
    } else {
        tabAnalyze.classList.remove('active');
        tabSettings.classList.add('active');
        viewAnalyze.classList.remove('active');
        viewSettings.classList.add('active');
    }
}

window.onmessage = (event) => {
    const msg = event.data.pluginMessage;
    if (!msg) return;

    if (msg.type === 'frames-captured') {
        capturedFrames = msg.frames;
        previewContainer.innerHTML = ''; // Clear previous

        capturedFrames.forEach(frame => {
            const wrapper = document.createElement('div');

            const blob = new Blob([frame.imageData as any], { type: 'image/png' });
            const url = URL.createObjectURL(blob);

            const img = document.createElement('img');
            img.src = url;
            img.className = 'preview-thumb';

            const badge = document.createElement('div');
            badge.className = 'frame-badge';
            badge.textContent = frame.name;

            wrapper.appendChild(img);
            wrapper.appendChild(badge);
            previewContainer.appendChild(wrapper);
        });

        promptArea.style.display = 'block';
        statusText.textContent = `Captured ${capturedFrames.length} frame(s).`;
    }

    if (msg.type === 'settings-loaded') {
        if (msg.apiKey && apiKeyInput) {
            apiKeyInput.value = msg.apiKey;
        }
    }
};

async function callGeminiAPI(apiKey: string, prompt: string, frames: CapturedFrame[]) {
    const multimodals = frames.map(frame => {
        const base64 = btoa(
            new Uint8Array(frame.imageData).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        return {
            inline_data: {
                mime_type: 'image/png',
                data: base64
            }
        };
    });

    const systemInstructions = `You are a Senior Product Designer and UX Researcher. 
    You are analyzing a set of connected UI/UX frames (e.g., a user flow or variations).
    
    CRITICAL STRUCTURE REQUIREMENTS:
    1. For EACH frame individually, start with a level 1 heading: # [FRAME NAME] or # SCREEN [N]
    2. Provide specific, actionable improvements for that specific frame based on UX principles.
    3. Use level 2 headings (##) for sub-categories within a screen analysis if needed.
    4. AFTER analyzing all individual frames, end with a level 1 heading: # CONCLUSION
    5. Provide a holistic summary and advice on how these frames work together as a system or flow.
    
    The frames provided are: ${frames.map((f, i) => `${i + 1}: ${f.name}`).join(', ')}.`;

    const requestBody = {
        contents: [{
            parts: [
                { text: `${systemInstructions}\n\nUser Question/Goal: ${prompt || 'Please analyze these designs collectively.'}` },
                ...multimodals
            ]
        }]
    };

    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

    // Markdown-lite rendering with support for # and ##
    const html = text
        .split('\n').map(line => {
            const trimmed = line.trim();
            // Headers
            if (trimmed.startsWith('# ')) return `<h1>${trimmed.substring(2)}</h1>`;
            if (trimmed.startsWith('## ')) return `<h2>${trimmed.substring(3)}</h2>`;

            // Lists
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                return `<p style="margin-left: 12px;">• ${trimmed.substring(2)}</p>`;
            }

            // Empty space
            if (trimmed === '') return '<div style="height: 8px;"></div>';

            return `<p>${line}</p>`;
        }).join('')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');

    responseArea.innerHTML = html;
    responseArea.style.display = 'block';
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
