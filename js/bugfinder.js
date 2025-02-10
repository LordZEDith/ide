export class BugFinder {
    constructor(editor, openAIService) {
        this.editor = editor;
        this.openAIService = openAIService;
        this.isProcessing = false;
        this.abortController = null;
    }

    async findBugs(input = '', stdin = '') {
        if (this.isProcessing) {
            console.log('Already processing a request');
            return;
        }

        this.isProcessing = true;
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

            console.log('Starting bug analysis with context:', {
                currentFileName,
                fileExtension,
                languageName,
                hasInput: !!input,
                hasStdin: !!stdin
            });

            // Get current editor content
            const currentContent = model.getValue();

            // Get bug analysis from AI
            const analysis = await this.openAIService.analyzeBugs(
                currentContent,
                fileExtension,
                languageName,
                input,
                stdin,
                this.abortController.signal
            );

            if (!analysis.hasBugs) {
                return {
                    success: true,
                    hasBugs: false,
                    message: 'No bugs detected in the code.'
                };
            }

            // Return the analysis with the fix preview
            return {
                success: true,
                hasBugs: true,
                message: analysis.explanation,
                code: analysis.fixedCode,
                originalCode: currentContent,
                language: fileExtension,
                apply: async () => {
                    try {
                        // Apply the changes
                        const fullRange = model.getFullModelRange();
                        
                        // Handle the edit operation based on editor type
                        if (this.editor.getModel) {
                            this.editor.pushUndoStop();
                            const success = this.editor.executeEdits('bugfinder', [{
                                range: fullRange,
                                text: analysis.fixedCode,
                                forceMoveMarkers: true
                            }]);
                            this.editor.pushUndoStop();
                            
                            if (!success) {
                                throw new Error('Failed to apply changes');
                            }
                        } else {
                            model.pushEditOperations(
                                [],
                                [{
                                    range: fullRange,
                                    text: analysis.fixedCode
                                }],
                                () => null
                            );
                        }

                        return {
                            success: true,
                            message: 'Bug fixes applied successfully.'
                        };
                    } catch (error) {
                        console.error('Error applying bug fixes:', error);
                        // Restore original content on error
                        model.setValue(currentContent);
                        throw error;
                    }
                }
            };
        } catch (error) {
            console.error('Bug finder error:', error);
            return {
                success: false,
                message: `Error during bug analysis: ${error.message}`
            };
        } finally {
            this.isProcessing = false;
            this.abortController = null;
        }
    }

    stop() {
        if (this.isProcessing && this.abortController) {
            console.log('Stopping bug finder process');
            this.abortController.abort();
        }
    }
} 