import { OpenAIService } from './openai-service.js';

export class AutoComplete {
    constructor(editor, openAIService) {
        this.editor = editor;
        this.openAIService = openAIService;
        this.suggestDelay = 350; // Delay before triggering suggestion
        this.suggestDebounce = null;
        this.currentSuggestion = null;
        this.suggestionMetadata = null; // Add metadata to track suggestion space
        this.decorations = [];
        this.isProcessing = false;
        this.lastActivityTime = Date.now();
        this.inactivityDelay = 2000; // Wait 2 seconds of inactivity
        this.lastCursorLine = null; // Track the last cursor line
        this.savedContent = null; // Store content below suggestion

        // Add ghost text styles immediately
        this.addGhostTextStyles();
        this.init();
    }

    addGhostTextStyles() {
        // Add styles if they don't exist
        if (!document.getElementById('ghost-text-styles')) {
            const style = document.createElement('style');
            style.id = 'ghost-text-styles';
            style.textContent = `
                .ghost-text {
                    color: #6e7681 !important;
                    opacity: 0.6 !important;
                    font-family: inherit !important;
                    display: inline-block !important;
                    position: relative !important;
                    pointer-events: none !important;
                    white-space: pre !important;
                }
                .monaco-editor .suggest-widget {
                    display: none !important;
                }
            `;
            document.head.appendChild(style);
        }
    }

    init() {
        // Track user activity (but don't clear suggestions)
        this.editor.onMouseMove(() => this.updateActivityTime(false));
        this.editor.onMouseDown(() => this.updateActivityTime(false));

        // Track cursor position changes
        this.editor.onDidChangeCursorPosition((e) => {
            const currentLine = e.position.lineNumber;
            if (this.lastCursorLine !== null && currentLine !== this.lastCursorLine) {
                // Clear suggestion if cursor moves to a different line
                this.clearSuggestion();
            }
            this.lastCursorLine = currentLine;
        });

        // Listen for content changes
        this.editor.onDidChangeModelContent(async (event) => {
            if (this.isProcessing) return;
            
            // Update activity time and clear suggestion only when typing
            this.updateActivityTime(true);
            
            // Clear any existing suggestion timeout
            if (this.suggestDebounce) {
                clearTimeout(this.suggestDebounce);
            }

            // Set a new timeout for suggestion
            this.suggestDebounce = setTimeout(() => {
                // Check if enough time has passed since last activity
                const timeSinceLastActivity = Date.now() - this.lastActivityTime;
                if (timeSinceLastActivity >= this.inactivityDelay) {
                    this.triggerSuggestion();
                } else {
                    // If user was recently active, wait for inactivity
                    const remainingWait = this.inactivityDelay - timeSinceLastActivity;
                    this.suggestDebounce = setTimeout(() => {
                        // Double check inactivity before triggering
                        if (Date.now() - this.lastActivityTime >= this.inactivityDelay) {
                            this.triggerSuggestion();
                        }
                    }, remainingWait);
                }
            }, this.suggestDelay);
        });

        // Listen for keyboard events to accept suggestions
        this.editor.onKeyDown((e) => {
            if (this.currentSuggestion && (e.code === 'Tab' || e.code === 'Enter' || (e.ctrlKey && e.code === 'KeyK'))) {
                e.preventDefault();
                e.stopPropagation();
                this.acceptSuggestion();
            } else if (e.code === 'Escape' && this.currentSuggestion) {
                this.clearSuggestion();
            }
        });
    }

    updateActivityTime(clearSuggestion = false) {
        this.lastActivityTime = Date.now();
        // Only clear suggestion if explicitly requested (i.e., when typing)
        if (clearSuggestion) {
            this.clearSuggestion();
        }
    }

    async triggerSuggestion() {
        console.log('triggerSuggestion called');
        if (!this.openAIService || this.isProcessing) {
            console.log('Skipping suggestion:', {
                hasOpenAIService: !!this.openAIService,
                isProcessing: this.isProcessing
            });
            return;
        }

        try {
            const model = this.editor.getModel();
            const position = this.editor.getPosition();
            
            // Get the file extension from the model's language ID
            const fileExtension = model.getLanguageId() || 'plaintext';
            
            // Get the selected language from the dropdown
            const selectedLanguage = document.getElementById('select-language');
            const languageName = selectedLanguage ? selectedLanguage.options[selectedLanguage.selectedIndex].text : 'Unknown';
            
            console.log('Language context:', {
                fileExtension,
                selectedLanguage: languageName
            });
            
            const lineContent = model.getLineContent(position.lineNumber);
            
            // Check if we're in a comment
            const isLineComment = lineContent.trim().startsWith('//');
            const isBlockComment = lineContent.trim().startsWith('/*') || lineContent.trim().startsWith('*');
            const isInBlockComment = this.isInBlockComment(model, position);

            if (!isLineComment && !isBlockComment && !isInBlockComment) {
                console.log('Not in a comment, skipping suggestion');
                this.clearSuggestion();
                return;
            }

            this.isProcessing = true;
            
            // Get only the current line as context
            const prefix = lineContent.substring(0, position.column - 1);
            const suffix = lineContent.substring(position.column - 1);

            // Get suggestion from AI with language context
            const suggestion = await this.openAIService.autoComplete(
                prefix, 
                suffix, 
                new AbortController().signal,
                '', // Additional context
                '', // Recent clipboard
                fileExtension,
                languageName
            );
            
            if (suggestion && suggestion.trim()) {
                // Clear any existing decorations and space
                this.clearSuggestion();
                
                const currentIndent = lineContent.match(/^\s*/)[0];
                const lines = suggestion.trim().split('\n').map(line => currentIndent + line);
                
                // Create space for the suggestion
                const insertPosition = position.lineNumber + 1;
                
                // Save all content after our insertion point before making any changes
                const allLines = model.getLinesContent();
                const contentAfter = allLines.slice(insertPosition - 1);
                this.savedContent = {
                    text: contentAfter.join('\n'),
                    startLine: insertPosition,
                    lines: contentAfter.length
                };

                // Create empty lines for the suggestion
                const emptyLines = '\n'.repeat(lines.length);
                
                this.editor.pushUndoStop();
                
                // First create space for the suggestion
                this.editor.executeEdits('create-space', [{
                    range: new monaco.Range(
                        insertPosition,
                        1,
                        insertPosition,
                        1
                    ),
                    text: emptyLines
                }]);

                // Create decorations for the empty lines
                const decorations = lines.map((line, index) => ({
                    range: new monaco.Range(
                        insertPosition + index,
                        1,
                        insertPosition + index,
                        1
                    ),
                    options: {
                        after: {
                            content: line,
                            inlineClassName: 'ghost-text'
                        },
                        showIfCollapsed: true,
                        isWholeLine: false,
                        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                    }
                }));

                // Store suggestion and metadata
                this.currentSuggestion = lines.join('\n');
                this.suggestionMetadata = {
                    startLine: insertPosition,
                    numberOfLines: lines.length
                };
                
                // Apply decorations
                this.decorations = this.editor.deltaDecorations([], decorations);
                
                // Ensure visibility
                this.editor.revealLine(insertPosition + lines.length - 1);
                
                this.editor.pushUndoStop();
            } else {
                this.clearSuggestion();
            }
        } catch (error) {
            console.error('Error in triggerSuggestion:', error);
            this.clearSuggestion();
        } finally {
            this.isProcessing = false;
        }
    }

    isInBlockComment(model, position) {
        // Search backwards to find if we're inside a block comment
        let line = position.lineNumber;
        let foundStart = false;
        
        while (line > 0) {
            const content = model.getLineContent(line);
            if (content.includes('*/')) {
                // Found end before start, so we're not in a block comment
                return false;
            }
            if (content.includes('/*')) {
                foundStart = true;
                break;
            }
            line--;
        }
        
        if (!foundStart) {
            return false;
        }
        
        // If we found a start, make sure there's no end between it and current position
        line = position.lineNumber;
        const lineCount = model.getLineCount();
        
        while (line <= lineCount) {
            const content = model.getLineContent(line);
            if (line === position.lineNumber) {
                // For current line, only check up to cursor position
                const contentUpToCursor = content.substring(0, position.column - 1);
                if (contentUpToCursor.includes('*/')) {
                    return false;
                }
                break;
            }
            if (content.includes('*/')) {
                return false;
            }
            line++;
        }
        
        return true;
    }

    acceptSuggestion() {
        if (!this.currentSuggestion || !this.suggestionMetadata) {
            console.log("Cannot accept suggestion:", {
                hasSuggestion: !!this.currentSuggestion,
                hasMetadata: !!this.suggestionMetadata
            });
            return;
        }

        const model = this.editor.getModel();
        if (!model) {
            console.log("Editor model not available");
            return;
        }

        // Log the current state of the lines we're about to modify
        const startLine = this.suggestionMetadata.startLine;
        const endLine = this.suggestionMetadata.startLine + this.suggestionMetadata.numberOfLines;
        
        // Get all content after our insertion point
        const allLines = model.getLinesContent();
        const contentAfter = allLines.slice(endLine);
        
        console.log("Current editor state:", {
            linesBefore: model.getLinesContent().slice(startLine - 1, endLine),
            totalLines: model.getLineCount(),
            suggestionLines: this.currentSuggestion.split('\n')
        });

        // Split the suggestion into lines and ensure proper line endings
        const suggestionLines = this.currentSuggestion.split('\n');
        const textToInsert = suggestionLines.join('\n') + '\n\n' + contentAfter.join('\n');

        // Create a range for just the insertion point
        const range = new monaco.Range(
            startLine,
            1,
            startLine,
            1
        );

        console.log("Edit operation details:", {
            range: {
                startLine: range.startLineNumber,
                startColumn: range.startColumn,
                endLine: range.endLineNumber,
                endColumn: range.endColumn
            },
            text: textToInsert,
            textLines: suggestionLines,
            numberOfLines: suggestionLines.length
        });

        // Execute the edit with proper undo/redo support
        this.editor.pushUndoStop();
        
        // First remove the empty lines
        this.editor.executeEdits('remove-space', [{
            range: new monaco.Range(
                startLine,
                1,
                endLine,
                1
            ),
            text: ''
        }]);

        // Then insert the actual content
        const editResult = this.editor.executeEdits('suggestion', [{
            range: range,
            text: textToInsert,
            forceMoveMarkers: true
        }]);

        console.log("Edit result:", {
            success: editResult,
            linesAfter: model.getLinesContent().slice(startLine - 1, startLine + suggestionLines.length),
            totalLinesAfter: model.getLineCount(),
            insertedContent: textToInsert
        });

        this.editor.pushUndoStop();

        // Clear the suggestion state and decorations
        this.currentSuggestion = null;
        this.suggestionMetadata = null;
        this.decorations = this.editor.deltaDecorations(this.decorations, []);
    }

    clearSuggestion() {
        if (this.currentSuggestion && this.suggestionMetadata) {
            const model = this.editor.getModel();
            if (!model) return;

            this.editor.pushUndoStop();
            
            // First remove the empty lines
            this.editor.executeEdits('remove-space', [{
                range: new monaco.Range(
                    this.suggestionMetadata.startLine,
                    1,
                    this.suggestionMetadata.startLine + this.suggestionMetadata.numberOfLines,
                    1
                ),
                text: ''
            }]);

            // Then restore the original content if we have it
            if (this.savedContent) {
                this.editor.executeEdits('restore-content', [{
                    range: new monaco.Range(
                        this.savedContent.startLine,
                        1,
                        this.savedContent.startLine,
                        1
                    ),
                    text: this.savedContent.text
                }]);
                this.savedContent = null;
            }

            this.editor.pushUndoStop();
            this.suggestionMetadata = null;
        }
        this.currentSuggestion = null;
        this.decorations = this.editor.deltaDecorations(this.decorations, []);
    }
} 