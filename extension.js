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
    CONTEXT_LENGTH = config.get('CONTEXT_LENGTH', 32);
    DELAY_SECONDS = config.get('DELAY_SECONDS', 1) * 1000; // Convert to milliseconds
    //API_URL = config.get('API_URL', 'https://immense-mastiff-incredibly.ngrok-free.app/api/generate');

    API_URL = config.get('API_URL', 'https://trusting-inherently-feline.ngrok-free.app/api/generate');
    // Register commands
    let toggleApiCallCommand = vscode.commands.registerCommand('typycopilot.toggleApiCall', toggleApiCall);
    let toggleModeCommand = vscode.commands.registerCommand('typycopilot.toggleMode', toggleModeAction);
    context.subscriptions.push(toggleApiCallCommand, toggleModeCommand);

     // Register a command for the Tab key
     let handleTabCommand = vscode.commands.registerCommand('extension.handleTab', handleTab);
     context.subscriptions.push(handleTabCommand);

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

    // Prompt the user for permission to enable auto-save
    enableAutoSave();
}

function enableAutoSave() {
    // Get the current workspace configuration for 'files'
    const configuration = vscode.workspace.getConfiguration('files');

    // Update the autoSave setting to 'afterDelay'
    configuration.update('autoSave', 'afterDelay', true)
        .then(() => {
            console.log('Auto-save enabled');
        }, err => {
            console.error('Error enabling auto-save:', err);
        });
}


function updateApiToggleStatusBar() {
    apiToggleStatusBar.text = `Taipy Copilot: ${isApiCallEnabled ? 'Enabled' : 'Disabled'}`;
    apiToggleStatusBar.command = 'typycopilot.toggleApiCall';
    apiToggleStatusBar.show();
}

function updateModeToggleStatusBar() {
    //modeToggleStatusBar.text = `Mode: ${mode === 'TaipyMarkdown' ? 'Taipy Markdown' : 'Python Code Generator'}`;
    //silent for now
    modeToggleStatusBar.text = ``;
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
    //vscode.workspace.onDidChangeTextDocument(onTextDocumentChange);
     // Register the text document change event listener
    let textDocumentChangeDisposable = vscode.workspace.onDidChangeTextDocument(onTextDocumentChange);
    context.subscriptions.push(textDocumentChangeDisposable);

    context.subscriptions.push(vscode.commands.registerCommand('extension.insertGhostText', insertGhostText));
}
 

// function toggleApiCall() {
//     isApiCallEnabled = !isApiCallEnabled;
//     updateApiToggleStatusBar(isApiCallEnabled ? 'API Call Enabled' : 'API Call Disabled');
// }

function insertSampleTextIfEditorEmpty() {
    if (mode != 'PythonCodeGenerator') return;
    const editor = vscode.window.activeTextEditor;
    if (editor && !editor.document.getText()) {
        const sampleText = '# In Taipy, create temperature converter app\nfrom taipy.gui import Gui\n# Your Taipy logic here\nGui(page).run(use_reloader=True, port=5007)';
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

function handleTab() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    // Check if there are any active ghost text decorations
    if (activeGhostTextDecorations.length > 0) {
        // Prevent the default tab behavior and insert ghost text
        insertGhostText();
    } else {
        // If no ghost text is present, execute the default tab behavior
        vscode.commands.executeCommand('tab');
    }
}

function onTextDocumentChange(event) {
    if (!isApiCallEnabled) return;
 
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const textAfterCursor = getTextAfterCursor(editor);
    if (textAfterCursor.trim().length > 0) {
        updateGeneralStatusBar("Text present after cursor: Fill-in-middle mode");
    }

    // Clear ghost text decorations if the change is not a tab press
    if (event.contentChanges.length > 0 && event.contentChanges[0].text !== '\t') {
        clearGhostTextDecorations(editor);
    }

    console.log('call');
    triggerDelayedAPICall(editor);
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

function containsTripleQuote(codeBlock) {
    return codeBlock.includes('"""');
}

async function triggerAPICall(editor) {
    let codeBlock;

    if (mode === 'TaipyMarkdown') {
        // Get the line before the cursor position
        codeBlock = '# In Taipy, ' + getLineBeforeCursor(editor, lastCursorPosition) + ':';

        fullCodeBlock = getCurrentCodeBlockFromBeginning(editor);

        if (containsTripleQuote(fullCodeBlock)) {
            console.log("The code block contains triple quotes. Let's go");
        } else {
            console.log("The code block does not contain triple quotes.");
            updateGeneralStatusBar('Not generating: outside of markdown, i.e. """');
            return
        }

    } else {
        // Get the whole document text and insert <FILL_ME> token at the cursor position in the text sent to API
        codeBlock = getCurrentCodeBlockFromBeginning(editor);
        //codeBlock = insertFillMeTokenInText(codeBlock, lastCursorPosition);
    }

    if (codeBlock) {
        try {
            updateGeneralStatusBar('Sending prompt to API...');
            const ghostText = await sendTextToLLMAPI(codeBlock);
  
            updateGeneralStatusBar('Response received from API.');
            const processedGhostText = processAPIResponse(ghostText);
            updateGhostTextDecoration(editor, processedGhostText);
        } catch (error) {
            console.error('Error fetching text:', error);
            updateGeneralStatusBar('Please give me few more initial text so I can suggest code');
        }
    }
}

function getLineBeforeCursor(editor, position) {
    const document = editor.document;
    let lineNumber = position.line;
    while (lineNumber >= 0) {
        const lineText = document.lineAt(lineNumber).text;
        if (lineText.trim().length > 0) {
            return lineText;
        }
        lineNumber--;
    }
    return '';
}


// function insertFillMeTokenInText(text, position) {
//     // Convert the text into an array of lines
//     const lines = text.split('\n');
//     const positionLine = position.line;
//     const positionChar = position.character;

//     // Check if the position line is within the range of lines array
//     if (positionLine < lines.length) {
//         // Insert <FILL_ME> at the specified character position in the specified line
//         lines[positionLine] = lines[positionLine].slice(0, positionChar) + '<FILL_ME>' + lines[positionLine].slice(positionChar);
//     } 
//     else {
//         // If position line is out of range, append <FILL_ME> at the end
//         lines.push('<FILL_ME>');
//     }

//     // Join the lines back into a single text string
//     return lines.join('\n');
// }


function getCurrentCodeBlockFromBeginning(editor) {
    if (!editor) {
        return '';  // Return an empty string if there's no active editor
    }
    const document = editor.document;
    return document.getText();  // Retrieves the entire text of the document
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

function formatApiResponse(responseText) {
    // Regular expression to find text between <| and |>
    //console.log(responseText)
    const regex = /<\|([\s\S]*?)\|>/;
    const match = regex.exec(responseText);

    if (match && match[1]) {
        // Return only the text between <| and |>
        return '<|' + match[1] + '|>';
    } else {
        // Return an empty string or some default text if no match is found
        return '<|{your_value_here}|text|>';
    }
}


async function sendTextToLLMAPI(text) {

    let modified_prompt = text //modify should be done at server for more robust
    const requestData = {
        inputs: modified_prompt,
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
            if (mode === 'TaipyMarkdown'){
                let modified_response = formatApiResponse(response.data.generated_text)
                return modified_response
            }
            else{
                let modified_response = response.data.generated_text
                return modified_response
            }
           
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
