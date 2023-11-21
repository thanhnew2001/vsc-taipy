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

    // Get the selected text within the context length
    const selection = editor.selection;
    lastCursorPosition = editor.selection.active;

    const startPosition = new vscode.Position(
        Math.max(0, lastCursorPosition.line - CONTEXT_LENGTH),
        Math.max(0, lastCursorPosition.character - CONTEXT_LENGTH)
    );

    const selectedText = editor.document.getText(new vscode.Range(startPosition, lastCursorPosition));

    if (selectedText.length > CONTEXT_LENGTH * 2) {
        // Truncate the selected text if it's longer than double the context length
        const truncatedLength = selectedText.length - CONTEXT_LENGTH * 2;
        selectedText = selectedText.substring(truncatedLength);
    }

    if (!selection.isEmpty) {
        // User is typing, set the flag to true
        userTyping = true;

        // Clear the timer
        clearTimeout(timer);
    }
}

// ... (rest of the code remains the same)

// ... (rest of the code remains the same)


function onTextDocumentChange(event) {
    // Handle Tab key presses separately when a document is modified
    if (event.contentChanges[0]?.text === '\t') {
        insertGhostText();
    } 
    else {
        // Clear the active ghost text decorations
        activeGhostTextDecorations = [];
        // Update the editor's decorations to remove the ghost text
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            editor.setDecorations(ghostTextDecorationType, activeGhostTextDecorations);
        }

        // User is not typing, trigger the API call
        if (!userTyping) {
            clearTimeout(timer);
            timer = setTimeout(() => {
                triggerAPICall(editor);
            }, 2000);
        }

        // Reset the userTyping flag
        userTyping = false;
    }
}


function getNLines(selectedText, n) {
    // Split the selected text into lines
    const lines = selectedText.split('\n');
    
    // Get the last n lines
    const lastNLines = lines.slice(-n);
    
    // Join the lines with newline characters
    const result = lastNLines.join('\n');
    
    // Return the combined lines as a text string
    return result;
}

async function triggerAPICall(editor) {
    // Get the selected text before the cursor position
    const selectedText = editor.document.getText(new vscode.Range(new vscode.Position(0, 0), lastCursorPosition));

    const partialText = getNLines(selectedText, 2)

	console.log("triggerAPICall->"+selectedText)
    if (selectedText) {
        try {
            const ghostText = await sendTextToLLMAPI(partialText);
            const processedGhostText = ghostText.replace(/\\/g, '')
                                               
            // Create a new decoration with updated contentText.
            const newDecoration = {
                range: new vscode.Range(lastCursorPosition, editor.selection.active),
                renderOptions: {
                    after: {
                        contentText: processedGhostText,
                        color: '#888888',
                    },
                },
            };

            // Add the new decoration to the list of active decorations
            activeGhostTextDecorations.push(newDecoration);

            // Apply all active decorations
            editor.setDecorations(ghostTextDecorationType, activeGhostTextDecorations);
        } catch (error) {
            console.error('Error fetching ghost text:', error);
        }
    }
}

async function sendTextToLLMAPI(text) {
    // Define the API endpoint and request data.
    const apiUrl = 'https://ade3-103-253-89-44.ngrok-free.app/api/generate';
    const requestData = {
        inputs: text,
        parameters: {   
            max_new_tokens: 24,
        },
    };

    // console.log(requestData)
    // Send a POST request to the LLM API.
    try {

        const timeoutMilliseconds = 10000; // set the timeout to 5 seconds (adjust as needed)
        const response = await axios.post(apiUrl, requestData, {
            timeout: timeoutMilliseconds,
        });
        console.log(response.status)
        if (response.status === 200) {
            text = response.data.generated_text
            console.log(text)
            return text;
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

    // Check if there are active ghost text decorations
    if (activeGhostTextDecorations.length > 0) {
        const ghostText = activeGhostTextDecorations[0].renderOptions.after.contentText;

        // Insert the ghost text at the cursor position
        editor.edit(editBuilder => {
            editBuilder.insert(lastCursorPosition, ghostText);
        });

        // Remove the active ghost text decoration
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
