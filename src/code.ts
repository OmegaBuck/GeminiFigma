// This plugin will open a window to load the UI in
figma.showUI(__html__, { width: 400, height: 600, themeColors: true });

// Calls to "parent.postMessage" from the UI will trigger this callback.
// The "msg" parameter is the value passed to "postMessage".
figma.ui.onmessage = async (msg) => {
    console.log('Plugin received message:', msg.type);

    if (msg.type === 'load-settings') {

        const apiKey = await figma.clientStorage.getAsync('apiKey');
        figma.ui.postMessage({ type: 'settings-loaded', apiKey });
    }

    if (msg.type === 'save-settings') {
        await figma.clientStorage.setAsync('apiKey', msg.apiKey);
    }

    if (msg.type === 'analyze-frame') {
        const selection = figma.currentPage.selection;

        if (selection.length !== 1 || selection[0].type !== 'FRAME') {
            figma.notify('Please select exactly one Frame to analyze.');
            return;
        }

        const frame = selection[0] as FrameNode;

        try {
            // Export frame as PNG
            const bytes = await frame.exportAsync({
                format: 'PNG',
                constraint: { type: 'SCALE', value: 2 },
            });

            // Send the bytes back to the UI
            figma.ui.postMessage({
                type: 'frame-captured',
                imageData: bytes,
                frameName: frame.name
            });

        } catch (error) {
            console.error(error);
            figma.notify('Failed to capture frame image.');
        }
    }

    if (msg.type === 'notify') {
        figma.notify(msg.message);
    }

    // Close the plugin
    if (msg.type === 'close') {
        figma.closePlugin();
    }
};
