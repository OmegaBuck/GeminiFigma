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
        const frames = selection.filter(node => node.type === 'FRAME') as FrameNode[];

        if (frames.length === 0) {
            figma.notify('Please select at least one Frame to analyze.');
            return;
        }

        try {
            const capturedFrames = await Promise.all(frames.map(async frame => {
                const bytes = await frame.exportAsync({
                    format: 'PNG',
                    constraint: { type: 'SCALE', value: 2 },
                });
                return {
                    name: frame.name,
                    imageData: bytes
                };
            }));

            figma.ui.postMessage({
                type: 'frames-captured',
                frames: capturedFrames
            });

        } catch (error) {
            console.error(error);
            figma.notify('Failed to capture frame images.');
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
