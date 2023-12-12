const vscode = require('vscode');
const axios = require('axios');

let disposable;
let ghostTextDecorationType;
let timer;
let lastCursorPosition;
let activeGhostTextDecorations = [];

let CONTEXT_LENGTH; // Will be set based on configuration
let DELAY_SECONDS;  // Will be set based on configuration
let API_URL;        // Will be set based on configuration

function activate(context) {
    // Read configurations
    const config = vscode.workspace.getConfiguration('typycopilot');
    CONTEXT_LENGTH = config.get('CONTEXT_LENGTH', 24);
    DELAY_SECONDS = config.get('DELAY_SECONDS', 1) * 1000; // Convert to milliseconds
    API_URL = config.get('API_URL', 'https://immense-mastiff-incredibly.ngrok-free.app/api/generate');

    // Rest of your activation code...
    futher_activate(context) 
}



function futher_activate(context) {
    updateStatusBar('TyPy Copilot activated!');

    ghostTextDecorationType = vscode.window.createTextEditorDecorationType({
        after: {
            contentText: '',
            color: '#888888',
        },
    });

    disposable = vscode.window.onDidChangeTextEditorSelection(updateSelectedText);
    vscode.workspace.onDidChangeTextDocument(onTextDocumentChange);
    context.subscriptions.push(vscode.commands.registerCommand('extension.insertGhostText', insertGhostText));
}

function updateStatusBar(message) {
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBar.text = message;
    statusBar.show();
    setTimeout(() => statusBar.dispose(), 5000);
}

function updateSelectedText(event) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    lastCursorPosition = editor.selection.active;
    clearTimeout(timer);
}

function onTextDocumentChange(event) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const textAfterCursor = getTextAfterCursor(editor);
    if (textAfterCursor.trim().length > 0) {
        clearGhostTextDecorations(editor);
        updateStatusBar("Ghost text generation stopped: Text present after cursor.");
        clearTimeout(timer);
    } else if (event.contentChanges[0]?.text === '\t') {
        // Prevent the default tab behavior
        event.preventDefault();
        insertGhostText();  
    } else {
        triggerDelayedAPICall(editor);
    }
}

// Add this helper method if it doesn't exist
function getTextAfterCursor(editor) {
    const currentPosition = editor.selection.active;
    const document = editor.document;
    const currentLine = document.lineAt(currentPosition.line);
    return currentLine.text.substring(currentPosition.character);
}


function triggerDelayedAPICall(editor) {
    clearTimeout(timer);
    timer = setTimeout(() => {
        triggerAPICall(editor);
    }, DELAY_SECONDS);
}

function getCurrentCodeBlock(editor, position) {
    const document = editor.document;
    const range = new vscode.Range(new vscode.Position(0, 0), position);
    return document.getText(range);
}

async function triggerAPICall(editor) {
    const codeBlock = getCurrentCodeBlock(editor, lastCursorPosition);
    if (codeBlock) {
        try {
            updateStatusBar('Sending prompt to API...');
            const ghostText = await sendTextToLLMAPI(codeBlock);
            console.log("prompt="+codeBlock)
            console.log("response="+ghostText)
            updateStatusBar('Response received from API.');
            const processedGhostText = processAPIResponse(ghostText);
            console.log("processed="+processedGhostText)
            updateGhostTextDecoration(editor, processedGhostText);
        } catch (error) {
            console.error('Error fetching text:', error);
            updateStatusBar('Error fetching text.');
        }
    }
}

function processAPIResponse(responseText) {
    const cleanedResponse = responseText.replace(/<PRE>/g, '');
    const lines = cleanedResponse.split('\n');
    if (lines.length > 1 && !lines[lines.length - 1].endsWith(';')) {
        lines.pop();
    }
    return lines.join('\n');
}

async function sendTextToLLMAPI(text) {
    const requestData = {
        inputs: text,
        parameters: { max_new_tokens: CONTEXT_LENGTH },
    };

    try {
        const timeoutMilliseconds = 5000;
        const response = await axios.post(API_URL, requestData, {
            timeout: timeoutMilliseconds,
        });

        if (response.status === 200) {
            return response.data.generated_text;
        } else {
            throw new Error(`LLM API request failed with status code: ${response.status}`);
        }
    } catch (error) {
        throw new Error(`Error sending text to LLM API: ${error.message}`);
    }
}

function clearGhostTextDecorations(editor) {
    activeGhostTextDecorations = [];
    editor.setDecorations(ghostTextDecorationType, activeGhostTextDecorations);
}

function updateGhostTextDecoration(editor, ghostText) {
    clearGhostTextDecorations(editor);

    const lines = ghostText.split('\n');
    lines.reverse().forEach((line, index) => {
        if (line) {
            // Calculate the position to insert this line of ghost text
            const linePosition = lastCursorPosition.with(lastCursorPosition.line + lines.length - 1 - index, Number.MAX_VALUE);
            const newDecoration = {
                range: new vscode.Range(linePosition, linePosition),
                renderOptions: {
                    after: {
                        contentText: line,
                        color: '#888888',
                        textDecoration: 'none;'
                    },
                },
            };
            activeGhostTextDecorations.push(newDecoration);
           
        }
    });
    editor.setDecorations(ghostTextDecorationType, activeGhostTextDecorations);
}


function insertGhostText() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || activeGhostTextDecorations.length === 0) return;

    editor.edit(editBuilder => {
        // Process the decorations in reverse order
        activeGhostTextDecorations.slice().reverse().forEach(decoration => {
            const ghostTextLine = decoration.renderOptions.after.contentText;
            // Insert at the last cursor position
            editBuilder.insert(lastCursorPosition, ghostTextLine + '\n');
        });
    });

    clearGhostTextDecorations(editor);
}

function deactivate() {
    disposable.dispose();
}

module.exports = {
    activate,
    deactivate,
};
