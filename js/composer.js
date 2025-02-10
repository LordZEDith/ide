import { OpenAIService } from './openai-service.js';

export class Composer {
    constructor(editor, openAIService) {
        this.editor = editor;
        this.openAIService = openAIService;
        this.isProcessing = false;
        this.abortController = null;
        this.maxAttempts = 3;
        this.currentAttempt = 0;
        this.stopRequested = false;
    }

    async processRequest(userRequest) {
        if (this.isProcessing) {
            console.log('Already processing a request');
            return;
        }

        this.isProcessing = true;
        this.currentAttempt = 0;
        this.stopRequested = false;
        this.abortController = new AbortController();

        try {
            // Handle both editor instances and models
            const model = this.editor.getModel ? this.editor.getModel() : this.editor;
            if (!model) {
                throw new Error('No active editor found');
            }

            // Get current filename and extension
            const currentFileName = $('.lm_title').first().text();
            const fileExtension = currentFileName.split('.').pop() || 'plaintext';
            
            // Get language name from the dropdown
            const selectedLanguage = document.getElementById('select-language');
            const languageName = selectedLanguage ? 
                selectedLanguage.options[selectedLanguage.selectedIndex].text : 
                'Unknown';

            console.log('Starting composition with context:', {
                currentFileName,
                fileExtension,
                languageName,
                request: userRequest
            });

            // Get current editor content
            const currentContent = model.getValue();

            while (this.currentAttempt < this.maxAttempts && !this.stopRequested) {
                this.currentAttempt++;
                console.log(`Attempt ${this.currentAttempt} of ${this.maxAttempts}`);

                try {
                    // Get modified code from AI
                    const modifiedCode = await this.openAIService.integrateCode(
                        currentContent,
                        '',  // No new code to integrate, just modifying existing
                        this.abortController.signal,
                        userRequest,
                        fileExtension,
                        languageName
                    );

                    if (this.stopRequested) {
                        console.log('Process stopped by user');
                        return {
                            success: false,
                            message: 'Process stopped by user.'
                        };
                    }

                    // First, return the code for preview
                    const previewResponse = {
                        success: true,
                        message: 'Reviewing changes before applying...',
                        code: modifiedCode,
                        originalCode: currentContent,  // Store original code for revert functionality
                        language: fileExtension,
                        needsPreview: true,
                        apply: async () => {  // Changed to arrow function to preserve context
                            const originalContent = currentContent; // Store original content in closure
                            try {
                                // Apply the changes
                                const fullRange = model.getFullModelRange();
                                
                                // Store editor reference from outer scope
                                const editor = this.editor;
                                
                                // Handle the edit operation based on editor type
                                if (editor.getModel) {
                                    // Monaco editor instance
                                    editor.pushUndoStop();
                                    const success = editor.executeEdits('composer', [{
                                        range: fullRange,
                                        text: modifiedCode,
                                        forceMoveMarkers: true
                                    }]);
                                    editor.pushUndoStop();
                                    
                                    if (!success) {
                                        throw new Error('Failed to apply changes');
                                    }
                                } else {
                                    // Direct model
                                    model.pushEditOperations(
                                        [],
                                        [{
                                            range: fullRange,
                                            text: modifiedCode
                                        }],
                                        () => null
                                    );
                                }

                                // Check for errors
                                const markers = monaco.editor.getModelMarkers({ owner: 'javascript' })
                                    .concat(monaco.editor.getModelMarkers({ owner: 'typescript' }))
                                    .concat(monaco.editor.getModelMarkers({ owner: model.getLanguageId() }));

                                const errors = markers.filter(m => m.severity === monaco.MarkerSeverity.Error);

                                if (errors.length === 0) {
                                    // Success! No errors found
                                    return {
                                        success: true,
                                        message: 'No erorrs detected changes applied successfully.',
                                        originalContent // Include original content in response
                                    };
                                }

                                // If we have errors, restore original content
                                if (editor.getModel) {
                                    editor.pushUndoStop();
                                    model.setValue(originalContent);
                                    editor.pushUndoStop();
                                } else {
                                    model.setValue(originalContent);
                                }
                                
                                return {
                                    success: false,
                                    message: 'Failed to apply changes. Errors were found in the code.',
                                    errors: errors.map(e => ({
                                        line: e.startLineNumber,
                                        message: e.message
                                    })),
                                    originalContent // Include original content in response
                                };
                            } catch (error) {
                                console.error('Error applying changes:', error);
                                // Restore original content on error
                                model.setValue(originalContent);
                                throw error;
                            }
                        },
                        revert: async () => {
                            const originalContent = currentContent; // Store original content in closure
                            try {
                                const editor = this.editor;
                                const fullRange = model.getFullModelRange();
                                
                                if (editor.getModel) {
                                    editor.pushUndoStop();
                                    const result = editor.executeEdits('composer', [{
                                        range: fullRange,
                                        text: originalContent,
                                        forceMoveMarkers: true
                                    }]);
                                    editor.pushUndoStop();
                                    
                                    if (!result) {
                                        throw new Error('Failed to revert changes');
                                    }
                                } else {
                                    model.setValue(originalContent);
                                }
                                
                                return {
                                    success: true,
                                    message: 'Changes reverted successfully.',
                                    code: originalContent,
                                    canReapply: true,
                                    modifiedCode // Store the modified code for potential reapply
                                };
                            } catch (error) {
                                console.error('Error reverting changes:', error);
                                return {
                                    success: false,
                                    message: `Error reverting changes: ${error.message}`,
                                    canReapply: false
                                };
                            }
                        },
                        reapply: async () => {
                            try {
                                const editor = this.editor;
                                const fullRange = model.getFullModelRange();
                                
                                if (editor.getModel) {
                                    editor.pushUndoStop();
                                    const result = editor.executeEdits('composer', [{
                                        range: fullRange,
                                        text: modifiedCode,
                                        forceMoveMarkers: true
                                    }]);
                                    editor.pushUndoStop();
                                    
                                    if (!result) {
                                        throw new Error('Failed to reapply changes');
                                    }
                                } else {
                                    model.setValue(modifiedCode);
                                }
                                
                                return {
                                    success: true,
                                    message: 'Changes reapplied successfully.'
                                };
                            } catch (error) {
                                console.error('Error reapplying changes:', error);
                                return {
                                    success: false,
                                    message: `Error reapplying changes: ${error.message}`,
                                    canReapply: true
                                };
                            }
                        }
                    };

                    return previewResponse;

                } catch (error) {
                    console.error('Error in composition attempt:', error);
                    if (this.currentAttempt >= this.maxAttempts) {
                        throw error;
                    }
                }
            }

            if (this.stopRequested) {
                // Restore original content if stopped
                model.setValue(currentContent);
                return {
                    success: false,
                    message: 'Process stopped by user.'
                };
            }

        } catch (error) {
            console.error('Composition error:', error);
            return {
                success: false,
                message: `Error during composition: ${error.message}`
            };
        } finally {
            this.isProcessing = false;
            this.abortController = null;
        }
    }

    stop() {
        if (this.isProcessing) {
            console.log('Stopping composition process');
            this.stopRequested = true;
            if (this.abortController) {
                this.abortController.abort();
            }
        }
    }
} 