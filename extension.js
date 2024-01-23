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
let isApiCallEnabled; // Control flag for API calls
let mode = 'TaipyMarkdown'; // Possible values: 'TaipyMarkdown', 'PythonCodeGenerator'

let CONTEXT_LENGTH; // Will be set based on configuration
let DELAY_SECONDS;  // Will be set based on configuration
let API_URL;        // Will be set based on configuration
let API_ENABLED;
function activate(context) {
    // Initialize status bar items
    apiToggleStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 300);
    modeToggleStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 200);
    generalStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

    // Read configurations
    const config = vscode.workspace.getConfiguration('typycopilot');
    CONTEXT_LENGTH = config.get('CONTEXT_LENGTH', 32);
    DELAY_SECONDS = config.get('DELAY_SECONDS', 0.5)*1000; // Convert to milliseconds
    API_URL = config.get('API_URL', 'https://taipycopilot.infinitiai.work/api/generate');
    API_ENABLED = config.get('API_ENABLED', true);

    console.log(API_ENABLED)

    isApiCallEnabled = API_ENABLED
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
    vscode.commands.executeCommand('setContext', 'isApiCallEnabled', true);

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

function updateSetting(name, value) {
    const configuration = vscode.workspace.getConfiguration();
    const settingName = name; // Replace with your setting name
    const newValue = value; // Replace with the value you want to set

    // Update the setting at the User level
    configuration.update(settingName, newValue, vscode.ConfigurationTarget.Global)
        .then(() => {
            vscode.window.showInformationMessage(`Setting ${settingName} updated to ${newValue}`);
        }, (error) => {
            vscode.window.showErrorMessage(`Error updating setting: ${error}`);
        });
}

function toggleApiCall() {
    isApiCallEnabled = !isApiCallEnabled;
    
    updateSetting("Taipycopilot.API_ENABLED", isApiCallEnabled)
    vscode.commands.executeCommand('setContext', 'isApiCallEnabled', isApiCallEnabled);

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


function isCursorOutsideTripleQuotes() {
    editor = vscode.window.activeTextEditor;
    if (!editor) {
        return true; // No open text editor, assume outside by default
    }

    const position = editor.selection.active;
    const document = editor.document;
    const textBeforeCursor = document.getText(new vscode.Range(new vscode.Position(0, 0), position));

    const tripleQuotesCount = (textBeforeCursor.match(/"{3}/g) || []).length;
    return tripleQuotesCount % 2 === 0; // Even count means outside triple quotes
}


function insertSampleTextIfEditorEmpty() {
    if (mode != 'PythonCodeGenerator') return;
    editor = vscode.window.activeTextEditor;
    if (editor && !editor.document.getText()) {
        const sampleText = '# In Taipy, create temperature converter app\nfrom taipy.gui import Gui\n# Your Taipy logic here\nGui(page).run(use_reloader=True, port=5007)';
        const firstLine = editor.document.lineAt(0);
        const edit = new vscode.WorkspaceEdit();
        edit.insert(editor.document.uri, firstLine.range.start, sampleText);
        vscode.workspace.applyEdit(edit);
    }
}

function updateSelectedText(event) {
    editor = vscode.window.activeTextEditor;
    if (!editor) return;

    lastCursorPosition = editor.selection.active;
    //clearTimeout(timer);
}

function handleTab() {
    editor = vscode.window.activeTextEditor;
    if (!editor || !vscode.commands.executeCommand('setContext', 'isApiCallEnabled', true)) return;

    // Check if the API call is enabled and if there are any active ghost text decorations
    if (isApiCallEnabled && activeGhostTextDecorations.length > 0) {
        // Insert ghost text instead of the default tab behavior
        insertGhostText();
    } else {
        // If no ghost text is present, execute the default tab behavior
        vscode.commands.executeCommand('tab');
    }
}

function onTextDocumentChange(event) {

    if (!isApiCallEnabled) return;
 
    editor = vscode.window.activeTextEditor;
    if (!editor) return;

    // const textAfterCursor = getTextAfterCursor(editor);
    // if (textAfterCursor.trim().length > 0) {
    //     updateGeneralStatusBar("Text present after cursor: Fill-in-middle mode");
    // }

    // Clear ghost text decorations if the change is not a tab press
    if (event.contentChanges.length > 0 && event.contentChanges[0].text !== '\t') {
        clearGhostTextDecorations(editor);
    }

    //make sure that it is cleared 
    //if there is another event come before its timeout
    clearTimeout(timer)
    // Set a new timer
    timer = setTimeout(() => {
        // Action to perform after the user has paused for the delay time
        triggerAPICall();
    }, DELAY_SECONDS);
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
    
    console.log("triggerAPICall..")
    
    editor = vscode.window.activeTextEditor;

    if (isCursorOutsideTripleQuotes()) return;

    let codeBlock;

    if (mode === 'TaipyMarkdown') {
        // Get the line before the cursor position
        codeBlock = '<s>[INST]' + getLineBeforeCursor(editor, lastCursorPosition) + '</INST>';

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
            updateGeneralStatusBar('Failed to generate, try changing your prompt');
        }
    }
}

function getLineBeforeCursor(editor, position) {
    try {
        editor = vscode.window.activeTextEditor;
        let lineNumber = position.line;
        while (lineNumber >= 0) {
            const lineText = editor.document.lineAt(lineNumber).text;
            if (lineText.trim().length > 0) {
                return lineText;
            }
            lineNumber--;
        }
        return '';
    } catch (error) {
        console.log(error)
    }
  
}


function getCurrentCodeBlockFromBeginning(editor) {
    if (!editor) {
        return '';  // Return an empty string if there's no active editor
    }
    const document = editor.document;
    return document.getText();  // Retrieves the entire text of the document
}


function processAPIResponse(responseText) {
    return responseText;
}

function extractMarkdownCode(input) {
    const regex = /<\|.*?\|>/g;

    value = input.match(regex) || [];
    return value[0]
}

function formatApiResponse(responseText) {
    const markdownCodeSegments = extractMarkdownCode(responseText);
    return markdownCodeSegments
}

async function sendTextToLLMAPI(text) {

    let modified_prompt = text //modify should be done at server for more robust
    const requestData = {
        inputs: modified_prompt,
        parameters: { max_new_tokens: CONTEXT_LENGTH },
        mode: mode
    };

    console.log(requestData)
    console.log("API_URL="+API_URL)

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
    console.log(ghostText)

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
    editor = vscode.window.activeTextEditor;
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
    vscode.commands.executeCommand('setContext', 'isApiCallEnabled', false);

    disposable.dispose();
    statusBar.dispose();
}

module.exports = {
    activate,
    deactivate,
};
