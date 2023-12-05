const vscode = require('vscode');
const axios = require('axios');

const CONTEXT_LENGTH = 32; // Default context length in tokens

let disposable;
let ghostTextDecorationType;
let timer; // Timer to trigger the API call after a pause
let lastCursorPosition; // Store the last cursor position for selected text
let userTyping = false; // Variable to track if the user is typing

// Maintain a list of active ghost text decorations
let activeGhostTextDecorations = [];

const URL = "https://immense-mastiff-incredibly.ngrok-free.app/api/generate"

function activate(context) {
    console.log('Ghost Text Extension is active!');

    ghostTextDecorationType = vscode.window.createTextEditorDecorationType({
        after: {
            contentText: '', // Initialize contentText as empty
            color: '#888888', // Ghost text color
        },
    });

    disposable = vscode.window.onDidChangeTextEditorSelection(updateSelectedText);
    vscode.workspace.onDidChangeTextDocument(onTextDocumentChange);

    // Register the "insertGhostText" command to handle Tab key presses
    context.subscriptions.push(vscode.commands.registerCommand('extension.insertGhostText', insertGhostText));
}

function updateSelectedText(event) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    lastCursorPosition = editor.selection.active;
    userTyping = true;
    clearTimeout(timer);
}

function onTextDocumentChange(event) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    if (event.contentChanges[0]?.text === '\t') {
        insertGhostText();
    } else {
        activeGhostTextDecorations = [];
        editor.setDecorations(ghostTextDecorationType, activeGhostTextDecorations);

        userTyping = false;
        clearTimeout(timer);
        timer = setTimeout(() => {
            triggerAPICall(editor);
        }, 1000); // Reduced delay
    }
}

function getCurrentCodeBlock(editor, position) {
    const document = editor.document;
    let startLine = position.line;
    while (startLine > 0 && !document.lineAt(startLine).text.includes('{')) {
        startLine--;
    }
    const endLine = position.line;
    const range = new vscode.Range(new vscode.Position(startLine, 0), new vscode.Position(endLine, 0));
    return document.getText(range);
}

async function triggerAPICall(editor) {
    const codeBlock = getCurrentCodeBlock(editor, lastCursorPosition);

    if (codeBlock) {
        try {
            const ghostText = await sendTextToLLMAPI(codeBlock);
            console.log("input sent: "+ghostText)
            const processedGhostText = processAPIResponse(ghostText);

            const newDecoration = {
                range: new vscode.Range(lastCursorPosition, editor.selection.active),
                renderOptions: {
                    after: {
                        contentText: processedGhostText,
                        color: '#888888',
                    },
                },
            };

            activeGhostTextDecorations.push(newDecoration);
            editor.setDecorations(ghostTextDecorationType, activeGhostTextDecorations);
        } catch (error) {
            console.error('Error fetching ghost text:', error);
        }
    }
}

function processAPIResponse(responseText) {
    const lines = responseText.split('\n');
    if (lines.length > 1 && !lines[lines.length - 1].endsWith(';')) {
        lines.pop();
    }
    return lines.join('\n');
}

async function sendTextToLLMAPI(text) {
    const apiUrl = URL;
    const requestData = {
        inputs: text,
        parameters: {   
            max_new_tokens: CONTEXT_LENGTH,
        },
    };

    try {
        const timeoutMilliseconds = 5000;
        const response = await axios.post(apiUrl, requestData, {
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

function insertGhostText() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    if (activeGhostTextDecorations.length > 0) {
        const ghostText = activeGhostTextDecorations[0].renderOptions.after.contentText;

        editor.edit(editBuilder => {
            editBuilder.insert(lastCursorPosition, ghostText);
        });

        activeGhostTextDecorations = [];
        editor.setDecorations(ghostTextDecorationType, activeGhostTextDecorations);
    }
}

function deactivate() {
    disposable.dispose();
}

module.exports = {
    activate,
    deactivate,
};
