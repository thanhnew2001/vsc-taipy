const vscode = require('vscode');
const axios = require('axios');
let disposable;
let ghostTextDecorationType;
let timer;
let lastCursorPosition;
let activeGhostTextDecorations = [];
let apiToggleStatusBar;
let modeToggleStatusBar;
let generalStatusBar;
let isApiCallEnabled = true; // Control flag for API calls
let mode = 'TaipyMarkdown'; // Possible values: 'TaipyMarkdown', 'PythonCodeGenerator'

let CONTEXT_LENGTH; // Will be set based on configuration
let DELAY_SECONDS;  // Will be set based on configuration
let API_URL;        // Will be set based on configuration

function activate(context) {
    // Initialize status bar items
    apiToggleStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 300);
    modeToggleStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 200);
    generalStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

    // Read configurations
    const config = vscode.workspace.getConfiguration('typycopilot');
    CONTEXT_LENGTH = config.get('CONTEXT_LENGTH', 36);
    DELAY_SECONDS = config.get('DELAY_SECONDS', 2) * 1000; // Convert to milliseconds
    API_URL = config.get('API_URL', 'https://immense-mastiff-incredibly.ngrok-free.app/api/generate');

    // Register commands
    let toggleApiCallCommand = vscode.commands.registerCommand('typycopilot.toggleApiCall', toggleApiCall);
    let toggleModeCommand = vscode.commands.registerCommand('typycopilot.toggleMode', toggleModeAction);
    context.subscriptions.push(toggleApiCallCommand, toggleModeCommand);

    // Setup and show status bars
    updateApiToggleStatusBar();
    updateModeToggleStatusBar();
    generalStatusBar.text = 'TaiPy Copilot Ready';
    generalStatusBar.show();

    // Add status bars to subscriptions
    context.subscriptions.push(apiToggleStatusBar, modeToggleStatusBar, generalStatusBar);

    // Further activation process
    further_activate(context);
    insertSampleTextIfEditorEmpty();
}

function updateApiToggleStatusBar() {
    apiToggleStatusBar.text = `API: ${isApiCallEnabled ? 'Enabled' : 'Disabled'}`;
    apiToggleStatusBar.command = 'typycopilot.toggleApiCall';
    apiToggleStatusBar.show();
}

function updateModeToggleStatusBar() {
    modeToggleStatusBar.text = `Mode: ${mode === 'TaipyMarkdown' ? 'Taipy Markdown' : 'Python Code Generator'}`;
    modeToggleStatusBar.command = 'typycopilot.toggleMode';
    modeToggleStatusBar.show();
}

function updateGeneralStatusBar(message){
    generalStatusBar.text = message
}

function toggleApiCall() {
    isApiCallEnabled = !isApiCallEnabled;
    updateApiToggleStatusBar();
    generalStatusBar.text = `API Call ${isApiCallEnabled ? 'Enabled' : 'Disabled'}`;
}

function toggleModeAction() {
    mode = mode === 'TaipyMarkdown' ? 'PythonCodeGenerator' : 'TaipyMarkdown';
    updateModeToggleStatusBar();
    generalStatusBar.text = `Mode switched to ${mode === 'TaipyMarkdown' ? 'Taipy Markdown' : 'Python Code Generator'}`;
    // Generate sample code
    insertSampleTextIfEditorEmpty()
}

function further_activate(context) {
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
 

function toggleApiCall() {
    isApiCallEnabled = !isApiCallEnabled;
    updateApiToggleStatusBar(isApiCallEnabled ? 'API Call Enabled' : 'API Call Disabled');
}

function insertSampleTextIfEditorEmpty() {
    if (mode != 'PythonCodeGenerator') return;
    const editor = vscode.window.activeTextEditor;
    if (editor && !editor.document.getText()) {
        const sampleText = '# In Taipy, create temperature converter app\nfrom taipy.gui import Gui\n<FILL_ME>\nGui(page).run(use_reloader=True, port=5007)';
        const firstLine = editor.document.lineAt(0);
        const edit = new vscode.WorkspaceEdit();
        edit.insert(editor.document.uri, firstLine.range.start, sampleText);
        vscode.workspace.applyEdit(edit);
    }
}

function updateSelectedText(event) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    lastCursorPosition = editor.selection.active;
    clearTimeout(timer);
}

function onTextDocumentChange(event) {

    if (!isApiCallEnabled) return;
 
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const textAfterCursor = getTextAfterCursor(editor);
    if (event.contentChanges.length > 0 && event.contentChanges[0].text !== '\t') {
        clearGhostTextDecorations(editor);
    }

    if (textAfterCursor.trim().length > 0) {
        updateGeneralStatusBar("TaiPycopilot stopped as there is text present after cursor.");
        clearTimeout(timer);
    } else if (event.contentChanges[0]?.text === '\t') {
        // Prevent the default tab behavior
        event.preventDefault();
        insertGhostText();
    } else {
        console.log('call')
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
    const textAfterCursor = getTextAfterCursor(editor);
    if (textAfterCursor.trim().length === 0) {
        clearTimeout(timer);
        timer = setTimeout(() => {
            triggerAPICall(editor);
        }, DELAY_SECONDS);
    }
}

function getCurrentCodeBlock(editor, position) {
    const document = editor.document;
    const range = new vscode.Range(new vscode.Position(0, 0), position);
    return document.getText(range);
}

function getCurrentCodeBlockFromBeginning(editor) {
    if (!editor) {
        return '';  // Return an empty string if there's no active editor
    }

    const document = editor.document;
    return document.getText();  // Retrieves the entire text of the document
}


async function triggerAPICall(editor) {
    const codeBlock = getCurrentCodeBlock(editor, lastCursorPosition);
    if (codeBlock) {
        try {
            updateGeneralStatusBar('Sending prompt to API...');
            const ghostText = await sendTextToLLMAPI(codeBlock);
            updateGeneralStatusBar('Response received from API.');
            const processedGhostText = processAPIResponse(ghostText);
            updateGhostTextDecoration(editor, processedGhostText);
        } catch (error) {
            console.error('Error fetching text:', error);
            updateGeneralStatusBar('Error fetching text.');
        }
    }
}

function processAPIResponse(responseText) {
    const cleanedResponse = responseText.replace(/<PRE>/g, '');
    const lines = cleanedResponse.split('\n');
    
    // Check if there is more than one line or if the last line ends with a semicolon
    if (lines.length > 1 && !lines[lines.length - 1].endsWith(';')) {
        lines.pop();
    } else if (lines.length === 1) {
        // If there is only one line and it does not end with a semicolon, return it as is
        return lines[0];
    }
    return lines.join('\n');
}

async function sendTextToLLMAPI(text) {
    console.log("testing..")
    const requestData = {
        inputs: text,
        parameters: { max_new_tokens: CONTEXT_LENGTH },
        mode: mode
    };

    console.log(requestData)

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
    statusBar.dispose();
}

module.exports = {
    activate,
    deactivate,
};
