import { OpenAIService } from './openai-service.js';
import { Composer } from './composer.js';
import { BugFinder } from './bugfinder.js';

// Function to safely get the current file name
function getCurrentFileName() {
    try {
        // Try to get the first title from the source editor tab
        const sourceTitle = $('.lm_title').first().text();
        return sourceTitle || 'untitled';
    } catch (error) {
        console.warn('Error getting source code name:', error);
        return 'untitled';
    }
}

// Helper function to map file extensions/languages to Monaco language IDs
function getMonacoLanguage(language) {
    const languageMap = {
        'cpp': 'cpp',
        'c++': 'cpp',
        'python': 'python',
        'py': 'python',
        'javascript': 'javascript',
        'js': 'javascript',
        'typescript': 'typescript',
        'ts': 'typescript',
        'html': 'html',
        'css': 'css',
        'json': 'json',
        'java': 'java',
        'csharp': 'csharp',
        'cs': 'csharp',
        'go': 'go',
        'rust': 'rust',
        'sql': 'sql',
        'ruby': 'ruby',
        'php': 'php',
        'shell': 'shell',
        'bash': 'shell',
        'plaintext': 'plaintext'
    };
    
    return languageMap[language?.toLowerCase()] || 'plaintext';
}

// Add composer instance
let composer;

// Add bugfinder instance
let bugFinder;

export function initChat(container, state) {
    let openAIService;
    let activeTab = 'CHAT';
    let abortController;

    // Create the chat component HTML
    const chatHTML = `
        <style>
            .diff-added {
                background-color: rgba(40, 167, 69, 0.2) !important;
            }
            .diff-added-gutter {
                border-left: 3px solid #28a745 !important;
            }
            .diff-added-glyph:before {
                content: '+';
                color: #28a745;
            }
            
            .diff-removed {
                background-color: rgba(220, 53, 69, 0.2) !important;
                text-decoration: line-through;
            }
            .diff-removed-gutter {
                border-left: 3px solid #dc3545 !important;
            }
            .diff-removed-glyph:before {
                content: '-';
                color: #dc3545;
            }
            
            .diff-modified {
                background-color: rgba(255, 193, 7, 0.2) !important;
            }
            .diff-modified-gutter {
                border-left: 3px solid #ffc107 !important;
            }
            .diff-modified-glyph:before {
                content: '•';
                color: #ffc107;
            }

            /* Container and layout styles */
            .chat-container {
                position: relative;
                height: 100%;
                display: flex;
                flex-direction: column;
            }

            .chat-tabs {
                padding: 0.5rem;
                background: #1e1e1e;
                border-bottom: 1px solid #333;
                display: flex;
                gap: 0.5rem;
            }

            .chat-tab {
                padding: 0.5rem 1rem;
                cursor: pointer;
                border-radius: 4px;
                background: #2d2d2d;
                border: 1px solid transparent;
                color: #888;
                transition: all 0.2s ease;
            }

            .chat-tab:hover {
                background: #363636;
                color: #fff;
            }

            .chat-tab.active {
                background: #363636;
                color: #fff;
                border-color: #444;
            }

            .model-selector-container {
                padding: 0.5rem;
                background: #1e1e1e;
                border-bottom: 1px solid #333;
            }

            /* Content area styles */
            .chat-content,
            .composer-content,
            .settings-container {
                flex: 1;
                display: none;
                height: calc(100% - 85px);
                overflow: hidden;
                flex-direction: column;
            }

            /* Messages area styles */
            .chat-messages,
            .composer-messages {
                flex: 1;
                overflow-y: auto;
                padding: 1rem;
            }

            /* Input container styles */
            .chat-input-container,
            .composer-input-container {
                padding: 1rem;
                background: #1e1e1e;
                border-top: 1px solid #333;
            }

            .chat-input-wrapper,
            .composer-input-wrapper {
                display: flex;
                gap: 0.5rem;
                align-items: flex-start;
            }

            /* Input styles */
            .chat-input,
            .composer-input {
                flex: 1;
                min-height: 38px;
                padding: 8px;
                background: #2d2d2d;
                border: 1px solid #444;
                border-radius: 4px;
                color: #fff;
                resize: vertical;
            }

            /* Button styles */
            .chat-submit,
            .composer-submit,
            .stop-composer-btn {
                padding: 8px 16px;
                background: #2d2d2d;
                border: 1px solid #444;
                border-radius: 4px;
                color: #fff;
                cursor: pointer;
            }

            .stop-composer-btn {
                background-color: #dc3545;
                margin-left: 0.5rem;
            }

            /* Message styles */
            .message {
                margin-bottom: 1rem;
                padding: 0.5rem;
                border-radius: 4px;
            }

            .message.user {
                background: #2d2d2d;
            }

            .message.assistant {
                background: #1e1e1e;
            }

            .message.error {
                background: rgba(220, 53, 69, 0.2);
                color: #dc3545;
            }

            .message.system {
                background: rgba(40, 167, 69, 0.2);
                color: #28a745;
            }

            .floating-diff-actions {
                background: #2d2d2d;
                padding: 8px;
                border-radius: 4px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            }

            .floating-diff-actions button {
                margin: 0 4px;
                padding: 6px 12px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                transition: opacity 0.2s;
            }

            .floating-diff-actions .accept-changes {
                background: #28a745;
                color: white;
            }

            .floating-diff-actions .reject-changes {
                background: #dc3545;
                color: white;
            }

            .floating-diff-actions button:hover {
                opacity: 0.9;
            }

            /* Code block action buttons */
            .code-block-action.revert {
                background-color: #dc3545;
                color: white;
            }
            
            .code-block-action.reapply {
                background-color: #28a745;
                color: white;
            }

            .code-block-action.changes {
                background-color: #0e639c;
                color: white;
            }

            .code-block-action.changes:hover {
                background-color: #1177bb;
            }

            .bugfinder-content {
                flex: 1;
                display: none;
                height: calc(100% - 85px);
                overflow: hidden;
                flex-direction: column;
                position: relative;
            }

            .bugfinder-messages {
                flex: 1;
                overflow-y: auto;
                padding: 1rem;
                padding-bottom: 5rem;
            }

            .bugfinder-input-container {
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                background: #1e1e1e;
                border-top: 1px solid #333;
                padding: 1rem;
                z-index: 10;
            }

            .bugfinder-input-wrapper {
                display: flex;
                gap: 0.5rem;
                align-items: flex-start;
            }
        </style>
        <div class="chat-container">
            <div class="chat-tabs">
                <div class="chat-tab active" data-tab="CHAT">CHAT</div>
                <div class="chat-tab" data-tab="COMPOSER">COMPOSER</div>
                <div class="chat-tab" data-tab="BUG FINDER">BUG FINDER</div>
                <div class="chat-tab" data-tab="SETTINGS">SETTINGS</div>
            </div>
            <div class="model-selector-container">
                <select class="model-selector">
                    <option value="gpt-4o">GPT-4</option>
                    <option value="gpt-4o-mini" selected>GPT-4 Mini</option>
                </select>
            </div>
            <div class="chat-content" data-content="CHAT">
            <div class="chat-messages">
                <!-- Messages will be dynamically added here -->
            </div>
            <div class="chat-input-container">
                <div class="chat-input-wrapper">
                    <textarea class="chat-input" rows="1" placeholder="Ask anything"></textarea>
                    <button class="chat-submit">
                        <i class="paper plane outline icon"></i>
                    </button>
                    </div>
                </div>
            </div>
            <div class="composer-content" data-content="COMPOSER" style="display: none;">
                <div class="composer-messages">
                    <!-- Composer messages will be added here -->
                </div>
                <div class="composer-input-container">
                    <div class="composer-input-wrapper">
                        <textarea class="composer-input" rows="1" placeholder="Describe what you want to create or modify."></textarea>
                        <button class="composer-submit">
                            <i class="paper plane outline icon"></i>
                        </button>
                        <button class="stop-composer-btn" style="display: none;">Stop Composer</button>
                    </div>
                </div>
            </div>
            <div class="bugfinder-content" data-content="BUG FINDER" style="display: none;">
                <div class="bugfinder-messages">
                    <!-- Bug finder messages will be added here -->
                </div>
                <div class="bugfinder-input-container">
                    <div class="bugfinder-input-wrapper">
                        <textarea class="bugfinder-input" rows="1" placeholder="Optional: Add test input or notes about the bug"></textarea>
                        <button class="find-bugs-btn">
                            Find Bugs
                        </button>
                        <button class="stop-bugfinder-btn" style="display: none;">Stop</button>
                    </div>
                </div>
            </div>
            <div class="settings-container" style="display: none;">
                <div class="settings-section">
                    <h3>API Keys</h3>
                    <div class="api-key-section">
                        <label>OpenAI API Key</label>
                        <div class="api-key-input-wrapper">
                            <input type="password" class="api-key-input" placeholder="Enter OpenAI API Key">
                            <i class="api-key-status arrow right icon"></i>
                        </div>
                        <button class="api-key-submit">Save API Key</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Add the chat HTML to the container
    container.getElement().html(chatHTML);

    // Get DOM elements
    const chatTabs = container.getElement().find('.chat-tab');
    const chatInput = container.getElement().find('.chat-input');
    const chatSubmit = container.getElement().find('.chat-submit');
    const chatMessages = container.getElement().find('.chat-messages');
    const settingsContainer = container.getElement().find('.settings-container');
    const apiKeyInput = container.getElement().find('.api-key-input');
    const apiKeyStatus = container.getElement().find('.api-key-status');
    const apiKeySubmit = container.getElement().find('.api-key-submit');
    const modelSelector = container.getElement().find('.model-selector');

    // Get additional DOM elements for bug finder
    const bugfinderInput = container.getElement().find('.bugfinder-input');
    const findBugsBtn = container.getElement().find('.find-bugs-btn');
    const bugfinderMessages = container.getElement().find('.bugfinder-messages');
    const stopBugfinderBtn = container.getElement().find('.stop-bugfinder-btn');

    // Function to update API key status indicator
    async function updateApiKeyStatus(apiKey) {
        if (!apiKey) {
            apiKeyStatus.removeClass('valid invalid');
            return;
        }

        try {
            const tempService = new OpenAIService(apiKey);
            const isValid = await tempService.validateApiKey();
            
            apiKeyStatus.removeClass('valid invalid');
            if (isValid) {
                apiKeyStatus.addClass('valid');
            } else {
                apiKeyStatus.addClass('invalid');
            }
        } catch (error) {
            apiKeyStatus.removeClass('valid').addClass('invalid');
        }
    }

    // Check for saved API key
    const savedApiKey = localStorage.getItem('openai_api_key');
    if (savedApiKey) {
        try {
            openAIService = new OpenAIService(savedApiKey);
            apiKeyInput.val(savedApiKey);
            updateApiKeyStatus(savedApiKey);
            settingsContainer.hide();
        } catch (error) {
            console.error('Error initializing OpenAI service:', error);
            settingsContainer.show();
        }
    } else {
        settingsContainer.show();
        addMessage('system', 'Please enter your OpenAI API key in the Settings tab to start chatting.');
    }

    // Handle API key input changes
    apiKeyInput.on('input', function() {
        const apiKey = $(this).val().trim();
        updateApiKeyStatus(apiKey);
    });

    // Handle API key submission
    apiKeySubmit.on('click', async () => {
        const apiKey = apiKeyInput.val().trim();
        if (!apiKey) {
            addMessage('error', 'Please enter an API key.');
            return;
        }

        try {
            const tempService = new OpenAIService(apiKey);
            const isValid = await tempService.validateApiKey();
            
            if (!isValid) {
                addMessage('error', 'Invalid API key. Please check your key and try again.');
                apiKeyStatus.removeClass('valid').addClass('invalid');
                return;
            }

            openAIService = tempService;
            localStorage.setItem('openai_api_key', apiKey);
            apiKeyStatus.removeClass('invalid').addClass('valid');
            settingsContainer.hide();
            chatMessages.show();
            chatInput.parent().parent().show();
            chatTabs.filter('[data-tab="CHAT"]').click();
            addMessage('system', 'API key saved successfully. You can now use the chat!');
        } catch (error) {
            apiKeyStatus.removeClass('valid').addClass('invalid');
            addMessage('error', 'Error validating API key: ' + error.message);
        }
    });

    // Handle model selection
    modelSelector.on('change', function() {
        if (openAIService) {
            openAIService.model = modelSelector.val();
        }
    });

    // Handle tab switching
    chatTabs.on('click', function() {
        chatTabs.removeClass('active');
        $(this).addClass('active');
        activeTab = $(this).data('tab');
        
        // Hide all content containers first
        container.getElement().find('[data-content]').hide().css('display', 'none');
        container.getElement().find('.settings-container').hide();
        
        // Show the appropriate container based on active tab
        if (activeTab === 'SETTINGS') {
            settingsContainer.show();
        } else if (activeTab === 'COMPOSER') {
            const composerContent = container.getElement().find('[data-content="COMPOSER"]');
            composerContent.show().css('display', 'flex');
            const composerInput = container.getElement().find('.composer-input');
            composerInput.focus();
        } else if (activeTab === 'CHAT') {
            const chatContent = container.getElement().find('[data-content="CHAT"]');
            chatContent.show().css('display', 'flex');
            const chatInput = container.getElement().find('.chat-input');
            chatInput.focus();
            } else if (activeTab === 'BUG FINDER') {
            const bugfinderContent = container.getElement().find('[data-content="BUG FINDER"]');
            bugfinderContent.show().css('display', 'flex');
            const bugfinderInput = container.getElement().find('.bugfinder-input');
            bugfinderInput.focus();
        }
    });

    // Get additional DOM elements for composer
    const composerInput = container.getElement().find('.composer-input');
    const composerSubmit = container.getElement().find('.composer-submit');
    const composerMessages = container.getElement().find('.composer-messages');
    const stopComposerBtn = container.getElement().find('.stop-composer-btn');

    // Function to add message to the appropriate container
    function addMessage(role, content, isComposer = false, isBugFinder = false) {
        const messageDiv = $('<div></div>')
            .addClass('message')
            .addClass(role);

        if (typeof content === 'string') {
            const messageContent = $('<div></div>')
                .addClass('message-content');

            if (role === 'user') {
                messageContent.attr('contenteditable', 'false')
                    .on('dblclick', function() {
                        console.log('Double click - entering edit mode');
                        $(this).attr('contenteditable', 'true')
                            .focus();
                        messageDiv.addClass('editing');
                        messageDiv.addClass('selecting');
                       
                        // Start tracking selection changes
                        // $(document).on('mouseup.selection keyup.selection', function() {
                        //     const selection = window.getSelection();
                        //     if (!selection.rangeCount) return;

                        //     const range = selection.getRangeAt(0);
                        //     console.log('Selection range:', {
                        //         startOffset: range.startOffset,
                        //         endOffset: range.endOffset,
                        //         text: selection.toString()
                        //     });
                            
                        //     if (range.startOffset !== range.endOffset) {
                        //         console.log('Adding selecting class - range detected');
                        //         messageDiv.addClass('selecting');
                        //     }
                        // })
                    })
                    .on('keydown', function(e) {
                        if (e.key === 'Enter') {
                            if (e.shiftKey) {
                                // Allow Shift+Enter for new line
                                return true;
                            }
                            
                            e.preventDefault();
                            const newText = $(this).text().trim();
                            
                            // Remove all messages after this one
                            messageDiv.nextAll().remove();
                                                 
                            // Exit edit mode
                            $(this).attr('contenteditable', 'false');
                            messageDiv.removeClass('editing selecting');
                            $(document).off('mouseup.selection keyup.selection');
                            window.getSelection().removeAllRanges();
                            
                            // Generate new response
                            if (openAIService) {
                                const responseStream = openAIService.chat(newText, abortController.signal);
                                handleStreamingResponse(responseStream).then(() => {
                                }).catch(error => {
                                    if (error.message !== 'Request was cancelled') {
                                        addMessage('error', 'Error: ' + error.message);
                                    }
                                });
                            }
                            
                            return false;
                        }
                    })
                    .on('blur', function() {
                        console.log('Blur event - exiting edit mode');
                        $(this).attr('contenteditable', 'false');
                        messageDiv.removeClass('editing selecting');
                        // Remove the selection handlers when exiting edit mode
                        $(document).off('mouseup.selection keyup.selection');
                        window.getSelection().removeAllRanges(); // Clear any selections
                    });
            }

            // First handle code blocks to prevent markdown parser from processing them
            console.log('Processing message content:', content);
            const codeBlocks = [];
            const codeBlockRegex = /```([\w+]+)?\n([\s\S]*?)```/g;
            const textWithPlaceholders = content.replace(codeBlockRegex, (match, lang, code) => {
                const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
                codeBlocks.push({ language: lang?.trim() || 'plaintext', code: code.trim() });
                console.log('Found code block:', { language: lang, code: code });
                return placeholder;
            });
            console.log('Text with placeholders:', textWithPlaceholders);

            console.log('Checking if marked is available:', typeof marked);
            console.log('Marked object:', marked);

            // Configure marked options
            try {
                marked.setOptions({
                    renderer: new marked.Renderer(),
                    highlight: null,
                    pedantic: false,
                    gfm: true,
                    breaks: true,
                    sanitize: false,
                    smartypants: false,
                    xhtml: false
                });
                console.log('Marked options set successfully');
            } catch (error) {
                console.error('Error setting marked options:', error);
            }

            // Create custom renderer
            const renderer = new marked.Renderer();
            console.log('Created renderer');
            
            // Handle inline code specially
            renderer.codespan = (code) => {
                console.log('Processing inline code:', code);
                return `<code class="inline-code">${code}</code>`;
            };

            // Handle code blocks (this is for single backtick code spans)
            renderer.code = (code, language) => {
                console.log('Processing code block:', { code, language });
                return `<code class="inline-code">${code}</code>`;
            };

            // Handle links to open in new tab
            renderer.link = (href, title, text) => {
                console.log('Processing link:', { href, title, text });
                return `<a href="${href}" title="${title || ''}" target="_blank" rel="noopener noreferrer">${text}</a>`;
            };

            try {
                console.log('Attempting to parse markdown');
                // Parse the markdown
                const html = marked.parse(textWithPlaceholders, { renderer });
                console.log('Parsed HTML:', html);

                // Replace code block placeholders with actual Monaco editor instances
                const finalHtml = html.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
                    console.log('Replacing code block placeholder:', match);
                    const { language, code } = codeBlocks[index];
                    const codeBlockContainer = createCodeBlock(code, language);
                    return `<div class="code-block-wrapper">${codeBlockContainer[0].outerHTML}</div>`;
                });
                console.log('Final HTML:', finalHtml);

                messageContent.html(finalHtml);
            } catch (error) {
                console.error('Markdown parsing error:', error);
                // Fallback to plain text if markdown parsing fails
                messageContent.text(content);
            }

            // Initialize any Monaco editors in the message
            messageContent.find('.code-block-content').each(function() {
                const content = $(this);
                const code = content.data('code');
                const language = content.data('language');
                
                if (code && language) {
                    const editorInstance = monaco.editor.create(this, {
                        value: code,
                        language: getMonacoLanguage(language),
                        theme: 'vs-dark',
                        readOnly: true,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        renderLineHighlight: 'none',
                        contextmenu: false,
                        lineNumbers: 'on',
                        glyphMargin: true,
                        scrollbar: {
                            vertical: 'hidden',
                            horizontal: 'hidden'
                        },
                        overviewRulerLanes: 0,
                        overviewRulerBorder: false,
                        hideCursorInOverviewRuler: true,
                        automaticLayout: true,
                        lineDecorationsWidth: 5,
                        lineNumbersMinChars: 3,
                        renderValidationDecorations: 'on',
                        hover: {
                            enabled: true,
                            delay: 100
                        }
                    });

                    // Adjust editor height to content
                    const lineHeight = editorInstance.getOption(monaco.editor.EditorOption.lineHeight);
                    const lineCount = editorInstance.getModel().getLineCount();
                    content.css('height', `${Math.min(200, lineCount * lineHeight + 10)}px`);
                }
            });

            messageDiv.append(messageContent);
        } else {
            messageDiv.append(content);
        }

        // Add to the appropriate message container
        const targetContainer = isBugFinder ? bugfinderMessages : (isComposer ? composerMessages : chatMessages);
        targetContainer.append(messageDiv);
        targetContainer.scrollTop(targetContainer[0].scrollHeight);
    }

    function createCodeBlock(code, language, originalCode = null) {
        const container = $('<div></div>')
            .addClass('code-block-container');

        // Store the composer functions if we have original code
        if (originalCode) {
            // Get the source editor from Monaco's first model
            const sourceEditor = monaco.editor.getModels()[0];
            if (!sourceEditor) {
                console.error('No active editor found');
                return container;
            }

            container.data('composer', {
                revert: async () => {
                    try {
                        // Since sourceEditor is already a model, we can use it directly
                        const fullRange = new monaco.Range(
                            1,
                            1,
                            sourceEditor.getLineCount(),
                            sourceEditor.getLineMaxColumn(sourceEditor.getLineCount())
                        );
                        
                        // Create edit operation
                        sourceEditor.pushEditOperations(
                            [],
                            [{
                                range: fullRange,
                                text: originalCode
                            }],
                            () => null
                        );
                        
                        return {
                            success: true,
                            message: 'Changes reverted successfully.',
                            code: originalCode,
                            canReapply: true,
                            modifiedCode: code // Store the modified code for potential reapply
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
                        // Since sourceEditor is already a model, we can use it directly
                        const fullRange = new monaco.Range(
                            1,
                            1,
                            sourceEditor.getLineCount(),
                            sourceEditor.getLineMaxColumn(sourceEditor.getLineCount())
                        );
                        
                        // Create edit operation
                        sourceEditor.pushEditOperations(
                            [],
                            [{
                                range: fullRange,
                                text: code
                            }],
                            () => null
                        );
                        
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
            });
        }

        const header = $('<div></div>')
            .addClass('code-block-header');

        const langLabel = $('<span></span>')
            .text(language || 'plaintext')
            .addClass('language-label');

        const actions = $('<div></div>')
            .addClass('code-block-actions');

        // Ask button
            const askButton = $('<button></button>')
                .addClass('code-block-action')
                .addClass('ask')
                .text('Ask')
                .on('click', () => attachCodeBlock(code, language));

        // Copy button
            const copyButton = $('<button></button>')
                .addClass('code-block-action')
                .text('Copy')
                .on('click', () => {
                    navigator.clipboard.writeText(code);
                    copyButton.text('Copied!');
                    setTimeout(() => copyButton.text('Copy'), 2000);
                });

        // Revert button (only if we have original code)
        let revertButton;
        if (originalCode) {
            const setupRevertHandler = () => {
                revertButton
                    .removeClass('reapply')
                    .addClass('revert')
                    .text('Revert')
                    .off('click')
                    .on('click', async () => {
                        try {
                            // Get the composer instance from the container
                            const composerInstance = container.data('composer');
                            if (!composerInstance) {
                                console.error('No composer instance found');
                                return;
                            }

                            // Call revert
                            const result = await composerInstance.revert();
                            if (result.success) {
                                // Transform the revert button into an apply button
                                revertButton
                                    .removeClass('revert')
                                    .addClass('reapply')
                                    .text('Apply')
                                    .off('click')
                                    .on('click', async () => {
                                        try {
                                            const reapplyResult = await composerInstance.reapply();
                                            if (reapplyResult.success) {
                                                setupRevertHandler(); // Re-setup the revert handler
                                            }
                                        } catch (error) {
                                            console.error('Error reapplying changes:', error);
                                        }
                                    });
                            }
                        } catch (error) {
                            console.error('Error reverting changes:', error);
                        }
                    });
            };

            revertButton = $('<button></button>')
                .addClass('code-block-action')
                .addClass('revert')
                .text('Revert');
            
            // Initial setup of revert handler
            setupRevertHandler();
        }

        // Collapse/Expand button
            const collapseButton = $('<button></button>')
                .addClass('code-block-action')
                .text('Collapse')
                .on('click', function() {
                    const content = container.find('.code-block-content');
                    const isCollapsed = content.is(':hidden');
                    content.slideToggle(200);
                    $(this).text(isCollapsed ? 'Collapse' : 'Expand');
                    if (!isCollapsed) {
                        const editorInstance = content.data('editor');
                        if (editorInstance) {
                            editorInstance.layout();
                        }
                    }
                });

        // Add all buttons to actions
        actions.append(askButton, copyButton);
        if (revertButton) {
            actions.append(revertButton);
        }

        // Add Apply button if the code block language matches the current file and we're in CHAT tab
            const currentFileName = getCurrentFileName();
        const currentFileExt = currentFileName.split('.').pop();
        const currentLanguage = getMonacoLanguage(currentFileExt);
        const blockLanguage = getMonacoLanguage(language);
        
        if (currentLanguage === blockLanguage && activeTab === 'CHAT') {
                const applyButton = $('<button></button>')
                    .addClass('code-block-action')
                    .addClass('apply')
                    .text('Apply')
                    .on('click', async () => {
                    try {
                        // Get the source editor from Monaco's first model
                        const sourceEditor = monaco.editor.getModels()[0];
                        if (!sourceEditor) {
                            console.error('No active editor found');
                            addMessage('error', 'No active editor found. Please open a file first.');
                            return;
                        }

                        // Create and show loading overlay on the source editor
                        const editorOverlay = $(`
                            <div class="editor-overlay">
                                <div class="loading-spinner">
                                    <i class="circle notch loading icon"></i>
                                    <span>Applying changes...</span>
                                </div>
                            </div>
                        `).appendTo(document.evaluate('/html/body/div[2]/div/div/div[1]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue);

                        await applyChanges(sourceEditor, code, openAIService, addMessage, chatMessages);

                        // Remove the overlay with a fade effect
                        editorOverlay.fadeOut(200, () => {
                            editorOverlay.remove();
                        });
                    } catch (error) {
                        // Remove overlay in case of error
                        $('.editor-overlay').fadeOut(200, function() {
                            $(this).remove();
                        });
                        addMessage('error', 'Error applying changes: ' + error.message);
                    }
                });
            actions.append(applyButton);
        } else if (originalCode && activeTab === 'COMPOSER') {
            // Add Changes button for Composer tab
            const changesButton = $('<button></button>')
                .addClass('code-block-action')
                .addClass('changes')
                .text('Changes')
                .on('click', async () => {
                    try {
                        // Create popup container for diff view
                        const popupContainer = $(`
                            <div class="diff-popup-overlay">
                                <div class="diff-popup">
                                    <div class="diff-popup-header">
                                        <h3>Review Changes</h3>
                                        <div class="diff-view-options">
                                            <label>
                                                <input type="checkbox" class="inline-diff-toggle"> Inline Diff
                                            </label>
                                        </div>
                                    </div>
                                    <div class="diff-popup-content">
                                        <div class="diff-editor-container" style="width: 100%; height: 100%;"></div>
                                    </div>
                                    <div class="diff-popup-footer">
                                        <button class="reject-changes">Close</button>
                                    </div>
                                </div>
                            </div>
                        `).appendTo('body');

                        // Add styles for the popup
                        const styleElement = $(`
                            <style>
                                .diff-popup-overlay {
                                    position: fixed;
                                    top: 0;
                                    left: 0;
                                    right: 0;
                                    bottom: 0;
                                    background: rgba(0, 0, 0, 0.7);
                                    display: flex;
                                    justify-content: center;
                                    align-items: center;
                                    z-index: 9999;
                                }
                                .diff-popup {
                                    background: #1e1e1e;
                                    border-radius: 8px;
                                    width: 90%;
                                    height: 90%;
                                    display: flex;
                                    flex-direction: column;
                                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
                                }
                                .diff-popup-header {
                                    padding: 16px;
                                    border-bottom: 1px solid #333;
                                    display: flex;
                                    justify-content: space-between;
                                    align-items: center;
                                }
                                .diff-popup-header h3 {
                                    margin: 0;
                                    color: #fff;
                                }
                                .diff-view-options {
                                    color: #fff;
                                }
                                .diff-popup-content {
                                    flex: 1;
                                    position: relative;
                                    overflow: hidden;
                                    min-height: 0;
                                }
                                .diff-editor-container {
                                    position: absolute;
                                    top: 0;
                                    left: 0;
                                    right: 0;
                                    bottom: 0;
                                }
                                .diff-popup-footer {
                                    padding: 16px;
                                    border-top: 1px solid #333;
                                    display: flex;
                                    justify-content: flex-end;
                                    gap: 8px;
                                }
                                .diff-popup-footer button {
                                    padding: 8px 16px;
                                    border: none;
                                    border-radius: 4px;
                                    cursor: pointer;
                                    font-size: 14px;
                                    background: #dc3545;
                                    color: white;
                                }
                            </style>
                        `).appendTo('head');

                        // Create diff editor
                        const editorContainer = popupContainer.find('.diff-editor-container')[0];
                        
                        setTimeout(() => {
                            const diffEditor = monaco.editor.createDiffEditor(editorContainer, {
                                renderSideBySide: true,
                                readOnly: true,
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                contextmenu: false,
                                lineNumbers: 'on',
                                glyphMargin: true,
                                overviewRulerLanes: 0,
                                overviewRulerBorder: false,
                                automaticLayout: true,
                                theme: 'vs-dark'
                            });

                            // Get the language from the file extension
                            const fileExt = currentFileName.split('.').pop();
                            const language = getMonacoLanguage(fileExt) || 'javascript';

                            // Create models
                            const originalModel = monaco.editor.createModel(originalCode, language);
                            const modifiedModel = monaco.editor.createModel(code, language);

                            // Set the models
                            diffEditor.setModel({
                                original: originalModel,
                                modified: modifiedModel
                            });

                            // Force initial layout
                            setTimeout(() => {
                                diffEditor.layout();
                            }, 100);

                            // Handle inline diff toggle
                            popupContainer.find('.inline-diff-toggle').on('change', function() {
                                diffEditor.updateOptions({
                                    renderSideBySide: !this.checked
                                });
                                setTimeout(() => {
                                    diffEditor.layout();
                                }, 50);
                            });

                            // Handle close button
                            popupContainer.find('.reject-changes').on('click', () => {
                                popupContainer.remove();
                                styleElement.remove();
                                originalModel.dispose();
                                modifiedModel.dispose();
                                diffEditor.dispose();
                            });
                        }, 0);
                            } catch (error) {
                        console.error('Error showing diff view:', error);
                        addMessage('error', 'Error showing diff view: ' + error.message, true);
                    }
                });
            actions.append(changesButton);
        }

        actions.append(collapseButton);

        header.append(langLabel, actions);

        const content = $('<div></div>')
            .addClass('code-block-content')
            .css({
                'height': '200px',
                'min-height': '50px',
                'resize': 'vertical'
            })
            .data('code', code)
            .data('language', language);

        container.append(header, content);

        return container;
    }

    function attachCodeBlock(code, language) {
        // Create a simplified version of createCodeBlock specifically for attached blocks
        const createAttachedBlock = (code, language) => {
            const container = $('<div></div>')
                .addClass('code-block-container');

            const header = $('<div></div>')
                .addClass('code-block-header');

            const langLabel = $('<span></span>')
                .text(language || 'plaintext')
                .addClass('language-label');

            const actions = $('<div></div>')
                .addClass('code-block-actions');

            // Only add Expand/Collapse and Remove buttons
            const collapseButton = $('<button></button>')
                .addClass('code-block-action')
                .text('Collapse')
                .on('click', function() {
                    const content = container.find('.code-block-content');
                    const isCollapsed = content.is(':hidden');
                    content.slideToggle(200);
                    $(this).text(isCollapsed ? 'Collapse' : 'Expand');
                    if (!isCollapsed) {
                        const editorInstance = content.data('editor');
                        if (editorInstance) {
                            editorInstance.layout();
                        }
                    }
                });
            
            const removeButton = $('<button></button>')
                .addClass('code-block-action')
                .text('Remove')
                .on('click', () => {
                    container.remove();
                });

            actions.append(collapseButton, removeButton);
        header.append(langLabel, actions);

        const content = $('<div></div>')
            .addClass('code-block-content')
            .css({
                    'height': '200px',
                'min-height': '50px',
                'resize': 'vertical'
            })
            .data('code', code)
            .data('language', language);

        container.append(header, content);
        return container;
        };

        // Create the block
        const attachedBlock = createAttachedBlock(code, language);

        // Insert the block before the appropriate input based on active tab
        if (activeTab === 'COMPOSER') {
            composerInput.parent().parent().before(attachedBlock);
        } else {
            chatInput.parent().parent().before(attachedBlock);
        }
        
        // Initialize Monaco editor for the attached block
        const content = attachedBlock.find('.code-block-content');
        const editorInstance = monaco.editor.create(content[0], {
            value: code,
            language: getMonacoLanguage(language),
            theme: 'vs-dark',
            readOnly: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            renderLineHighlight: 'none',
            contextmenu: false,
            lineNumbers: 'on',
            glyphMargin: true,
            scrollbar: {
                vertical: 'hidden',
                horizontal: 'hidden'
            },
            overviewRulerLanes: 0,
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            automaticLayout: true,
            lineDecorationsWidth: 5,
            lineNumbersMinChars: 3,
            renderValidationDecorations: 'on',
            hover: {
                enabled: true,
                delay: 100
            }
        });

        // Store editor instance on the content element
        content.data('editor', editorInstance);

        // Adjust editor height based on content
        const lineHeight = editorInstance.getOption(monaco.editor.EditorOption.lineHeight);
        const lineCount = editorInstance.getModel().getLineCount();
        content.css('height', `${Math.min(200, lineCount * lineHeight + 10)}px`);

        // Focus the appropriate input
        if (activeTab === 'COMPOSER') {
            composerInput.focus();
        } else {
        chatInput.focus();
        }
    }

    // Handle streaming response
    async function handleStreamingResponse(responseStream) {
        let currentMessageDiv;
        let fullContent = '';
        
        try {
            // Create the message div once at the start
            currentMessageDiv = $('<div></div>')
                .addClass('message')
                .addClass('assistant');
            chatMessages.append(currentMessageDiv);

            // Show thinking animation
            const thinkingDiv = $('<div></div>')
                .addClass('thinking-animation')
                .css({
                    'padding': '0.75rem',
                    'color': '#888'
                })
                .html('<i class="circle notch loading icon"></i> Thinking...');
            currentMessageDiv.append(thinkingDiv);

            // Collect the full response first
            for await (const chunk of responseStream) {
                fullContent += chunk;
            }

            // Remove thinking animation
            thinkingDiv.remove();

            // Create a temporary div for simulated streaming
            const streamingDiv = $('<div></div>').css('white-space', 'pre-wrap');
            currentMessageDiv.append(streamingDiv);

            // First, split the content into text and code blocks while preserving order
            const segments = [];
            let lastIndex = 0;
            const codeBlockRegex = /```([\w+]+)?\n([\s\S]*?)```/g;
            let match;

            while ((match = codeBlockRegex.exec(fullContent)) !== null) {
                // Add text before code block if any
                if (match.index > lastIndex) {
                    segments.push({
                        type: 'text',
                        content: fullContent.slice(lastIndex, match.index)
                    });
                }
                
                // Add code block
                segments.push({
                    type: 'code',
                    language: match[1]?.trim() || 'plaintext',
                    content: match[2].trim()
                });
                
                lastIndex = match.index + match[0].length;
            }

            // Add remaining text if any
            if (lastIndex < fullContent.length) {
                segments.push({
                    type: 'text',
                    content: fullContent.slice(lastIndex)
                });
            }

            // Process and stream each segment
            for (const segment of segments) {
                if (segment.type === 'text') {
                    // Parse markdown for text segments
                    const renderer = new marked.Renderer();
                    renderer.codespan = (code) => `<code class="inline-code">${code}</code>`;
                    renderer.code = (code, language) => `<code class="inline-code">${code}</code>`;
                    
                    const html = marked.parse(segment.content, { renderer });
                    
                    // Stream text content word by word
                    const words = html.split(/(?<=>)(?=<)|(?<=[.!?])\s+/g);
                    for (const word of words) {
                        streamingDiv.append(word);
                        chatMessages.scrollTop(chatMessages[0].scrollHeight);
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                } else {
                    // Create and append code block immediately
                    const codeBlockContainer = createCodeBlock(segment.content, segment.language);
                    const wrapper = $('<div class="code-block-wrapper"></div>').append(codeBlockContainer);
                    streamingDiv.append(wrapper);
                    chatMessages.scrollTop(chatMessages[0].scrollHeight);
                    
                    // Initialize Monaco editor
                    const content = codeBlockContainer.find('.code-block-content');
                    const editorInstance = monaco.editor.create(content[0], {
                        value: segment.content,
                        language: getMonacoLanguage(segment.language),
                        theme: 'vs-dark',
                        readOnly: true,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        renderLineHighlight: 'none',
                        contextmenu: false,
                        lineNumbers: 'on',
                        glyphMargin: true,
                        scrollbar: {
                            vertical: 'hidden',
                            horizontal: 'hidden'
                        },
                        overviewRulerLanes: 0,
                        overviewRulerBorder: false,
                        hideCursorInOverviewRuler: true,
                        automaticLayout: true,
                        lineDecorationsWidth: 5,
                        lineNumbersMinChars: 3,
                        renderValidationDecorations: 'on',
                        hover: {
                            enabled: true,
                            delay: 100
                        }
                    });

                    const lineHeight = editorInstance.getOption(monaco.editor.EditorOption.lineHeight);
                    const lineCount = editorInstance.getModel().getLineCount();
                    content.css('height', `${Math.min(200, lineCount * lineHeight + 10)}px`);
                    
                    // Add small delay after code block
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        } catch (error) {
            if (error.message !== 'Request was cancelled') {
                addMessage('error', 'Error: ' + error.message);
            }
        }
    }

    // Handle composer submit
    const handleComposerSubmit = async () => {
        if (!openAIService) {
            addMessage('error', 'Please enter your OpenAI API key in the Settings tab first.', true);
            chatTabs.filter('[data-tab="SETTINGS"]').click();
            return;
        }

        const message = composerInput.val().trim();
        if (!message) return;

        // Get any attached code blocks
        const attachedBlocks = composerInput.parent().parent().prevAll('.code-block-container').map(function() {
            const content = $(this).find('.code-block-content');
            const code = content.data('code');
            const language = content.data('language');
            return `\`\`\`${language}\n${code}\n\`\`\``;
        }).get().reverse().join('\n\n');

        // Combine attached code blocks with user message
        const fullMessage = attachedBlocks ? `Attached code block:\n\n${attachedBlocks}\n\n${message}` : message;

        // Add user message
        addMessage('user', fullMessage, true);

        // Clear input and remove attached code blocks
        composerInput.val('');
        composerInput.css('height', 'auto');
        composerInput.parent().parent().prevAll('.code-block-container').remove();

        // Check if this is a simple question (no code modification intent)
        const codeModificationKeywords = [
            'modify', 'change', 'update', 'add', 'remove', 'delete', 'create', 'implement',
            'fix', 'refactor', 'rename', 'move', 'copy', 'paste', 'write', 'code'
        ];
        
        const isSimpleQuestion = !attachedBlocks && 
            !codeModificationKeywords.some(keyword => message.toLowerCase().includes(keyword));

        if (isSimpleQuestion) {
            try {
        // Cancel any ongoing request
        if (abortController) {
            abortController.abort();
        }

        // Create new abort controller for this request
        abortController = new AbortController();

                const responseStream = openAIService.chat(fullMessage, abortController.signal);
                
                // Create message div for assistant's response
                const messageDiv = $('<div></div>')
                    .addClass('message')
                    .addClass('assistant');
                composerMessages.append(messageDiv);

                // Show thinking animation
                const thinkingDiv = $('<div></div>')
                    .addClass('thinking-animation')
                    .css({
                        'padding': '0.75rem',
                        'color': '#888'
                    })
                    .html('<i class="circle notch loading icon"></i> Thinking...');
                messageDiv.append(thinkingDiv);

                // Collect the full response
                let fullContent = '';
                for await (const chunk of responseStream) {
                    fullContent += chunk;
                }

                // Remove thinking animation
                thinkingDiv.remove();

                // Create a div for the response content
                const streamingDiv = $('<div></div>').css('white-space', 'pre-wrap');
                messageDiv.append(streamingDiv);

                // Process the response with markdown and code blocks
                const renderer = new marked.Renderer();
                renderer.codespan = (code) => `<code class="inline-code">${code}</code>`;
                renderer.code = (code, language) => `<code class="inline-code">${code}</code>`;
                
                const html = marked.parse(fullContent, { renderer });
                streamingDiv.html(html);

                // Scroll to the new message
                composerMessages.scrollTop(composerMessages[0].scrollHeight);
            } catch (error) {
                if (error.message !== 'Request was cancelled') {
                    addMessage('error', 'Error: ' + error.message, true);
                }
            }
            return;
        }

        // If it's a code modification request, proceed with the normal composer flow
                const sourceEditor = monaco.editor.getModels()[0];
                if (!sourceEditor) {
            addMessage('error', 'No active editor found. Please open a file first.', true);
                    return;
                }

        // Initialize composer if not already done
        if (!composer) {
            composer = new Composer(sourceEditor, openAIService);
        }

        // Show stop button
        stopComposerBtn.show();

        try {
            addMessage('system', 'Starting composer process...', true);

            const result = await composer.processRequest(fullMessage);
            
            if (result.needsPreview) {
                // Create a message div for the assistant's response
                const messageDiv = $('<div></div>')
                    .addClass('message')
                    .addClass('assistant');
                composerMessages.append(messageDiv);

                // Create the message content
                const messageContent = $('<div></div>')
                    .addClass('message-content');

                // Create the code block
                const codeBlockContainer = createCodeBlock(result.code, result.language, result.originalCode);
                const wrapper = $('<div class="code-block-wrapper"></div>').append(codeBlockContainer);
                messageContent.append(wrapper);
                messageDiv.append(messageContent);

                // Initialize Monaco editor in the code block
                const content = codeBlockContainer.find('.code-block-content');
                const editorInstance = monaco.editor.create(content[0], {
                    value: result.code,
                    language: getMonacoLanguage(result.language),
                    theme: 'vs-dark',
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    renderLineHighlight: 'none',
                    contextmenu: false,
                    lineNumbers: 'on',
                    glyphMargin: true,
                    scrollbar: {
                        vertical: 'hidden',
                        horizontal: 'hidden'
                    },
                    overviewRulerLanes: 0,
                    overviewRulerBorder: false,
                    hideCursorInOverviewRuler: true,
                    automaticLayout: true,
                    lineDecorationsWidth: 5,
                    lineNumbersMinChars: 3,
                    renderValidationDecorations: 'on',
                    hover: {
                        enabled: true,
                        delay: 100
                    }
                });

                // Adjust editor height based on content
                const lineHeight = editorInstance.getOption(monaco.editor.EditorOption.lineHeight);
                const lineCount = editorInstance.getModel().getLineCount();
                content.css('height', `${Math.min(200, lineCount * lineHeight + 10)}px`);

                // Scroll to the new message
                composerMessages.scrollTop(composerMessages[0].scrollHeight);

                addMessage('system', 'Applying & Analyzing changes...', true);
                
                // Apply the changes
                const applyResult = await result.apply();
                
                // Hide stop button
                stopComposerBtn.hide();
                
                // Add result message
                if (applyResult.success) {
                    addMessage('system', '✓ ' + applyResult.message, true);
                } else {
                    if (applyResult.errors) {
                        const errorList = applyResult.errors.map(e => `Line ${e.line}: ${e.message}`).join('\n');
                        addMessage('error', `✗ ${applyResult.message}\nErrors found:\n${errorList}`, true);
                    } else {
                        addMessage('error', '✗ ' + applyResult.message, true);
                    }
                }
            } else {
                // Hide stop button
                stopComposerBtn.hide();

                // Add result message
                if (result.success) {
                    addMessage('system', '✓ ' + result.message, true);
                } else {
                    addMessage('error', '✗ ' + result.message, true);
                }
            }
        } catch (error) {
            addMessage('error', 'Error: ' + error.message, true);
            stopComposerBtn.hide();
        }
    };

    // Bind composer events
    composerSubmit.on('click', handleComposerSubmit);
    composerInput.on('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleComposerSubmit();
        }
    });

    // Auto-resize composer textarea
    composerInput.on('input', function() {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
    });

    // Handle stop composer
    stopComposerBtn.on('click', () => {
        if (composer) {
            composer.stop();
            stopComposerBtn.hide();
        }
    });

    // Handle bug finder
    const handleBugFinderSubmit = async () => {
        try {
            const input = bugfinderInput.val().trim();
            
            // Get the source editor
            const sourceEditor = monaco.editor.getModels()[0];
            if (!sourceEditor) {
                addMessage('error', 'No active editor found. Please open a file first.', true);
                    return;
                }

            // Clear previous responses before starting new analysis
            bugfinderMessages.empty();
            
            // Initialize bug finder if needed
            if (!bugFinder) {
                bugFinder = new BugFinder(sourceEditor, openAIService);
            }

            // Show stop button
            stopBugfinderBtn.show();

            // Get stdin from the stdin editor if it exists
            const stdin = window.stdinEditor ? window.stdinEditor.getValue().trim() : '';

            addMessage('system', 'Analyzing code for bugs...', false, true);

            // Only pass non-empty values
            const result = await bugFinder.findBugs(
                input || undefined,
                stdin || undefined
            );
            
            if (result.success) {
                if (!result.hasBugs) {
                    addMessage('system', '✓ ' + result.message, false, true);
                } else {
                    // Create a message div for the assistant's response
                    const messageDiv = $('<div></div>')
                        .addClass('message')
                        .addClass('assistant');
                    bugfinderMessages.append(messageDiv);

                    // Create the message content with Markdown support
                    const messageContent = $('<div></div>')
                        .addClass('message-content');
                    
                    // Convert explanation to markdown
                    messageContent.html(marked.parse(result.message));
                    messageDiv.append(messageContent);

                    // Create the code block with the fixed code
                    const codeBlockContainer = $('<div class="code-block-container"></div>');
                    const codeBlockHeader = $('<div class="code-block-header"></div>');
                    const languageLabel = $('<span class="language-label"></span>').text(result.language || 'text');
                    const codeBlockActions = $('<div class="code-block-actions"></div>');

                    // Create toggle button for Apply/Revert
                    const toggleBtn = $('<button class="code-block-action apply">Apply Changes</button>');
                    let isApplied = false;

                    toggleBtn.click(async () => {
                        try {
                            if (!isApplied) {
                                // Apply changes
                                const applyResult = await result.apply();
                                if (applyResult.success) {
                                    isApplied = true;
                                    toggleBtn.removeClass('apply').addClass('revert').text('Revert Changes');
                                    // Clear the input after successful apply
                                    bugfinderInput.val('');
                                    bugfinderInput.css('height', 'auto');
                                } else {
                                    addMessage('error', '✗ ' + applyResult.message, false, true);
                                }
                            } else {
                                // Revert changes
                                const sourceEditor = monaco.editor.getModels()[0];
                                if (sourceEditor) {
                                    const fullRange = sourceEditor.getFullModelRange();
                                    sourceEditor.pushEditOperations(
                                        [],
                                        [{
                                            range: fullRange,
                                            text: result.originalCode
                                        }],
                                        () => null
                                    );
                                    isApplied = false;
                                    toggleBtn.removeClass('revert').addClass('apply').text('Apply Changes');
                                }
                            }
                        } catch (error) {
                            addMessage('error', 'Failed to ' + (isApplied ? 'revert' : 'apply') + ' changes: ' + error.message, false, true);
                        }
                    });

                    codeBlockActions.append(toggleBtn);
                    codeBlockHeader.append(languageLabel, codeBlockActions);

                    // Create diff editor by default
                    const diffContainer = $('<div class="code-block-content" style="height: 400px;"></div>');
                    const originalModel = monaco.editor.createModel(result.originalCode, getMonacoLanguage(result.language));
                    const modifiedModel = monaco.editor.createModel(result.code, getMonacoLanguage(result.language));

                    // Create diff editor
                    const diffEditor = monaco.editor.createDiffEditor(diffContainer[0], {
                        renderSideBySide: true,
                        readOnly: true,
                        minimap: { enabled: false },
                        automaticLayout: true,
                        theme: 'vs-dark'
                    });

                    diffEditor.setModel({
                        original: originalModel,
                        modified: modifiedModel
                    });

                    codeBlockContainer.append(codeBlockHeader, diffContainer);
                    messageContent.append(codeBlockContainer);

                    // Scroll to the new message
                    bugfinderMessages.scrollTop(bugfinderMessages[0].scrollHeight);
                }
            } else {
                addMessage('error', '✗ ' + result.message, false, true);
            }
        } catch (error) {
            addMessage('error', 'Error: ' + error.message, false, true);
        } finally {
            stopBugfinderBtn.hide();
            bugfinderInput.val('');
        }
    };

    // Bind bug finder events
    findBugsBtn.on('click', handleBugFinderSubmit);
    bugfinderInput.on('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleBugFinderSubmit();
        }
    });

    // Auto-resize bug finder textarea
    bugfinderInput.on('input', function() {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
    });

    // Handle stop bug finder
    stopBugfinderBtn.on('click', () => {
        if (bugFinder) {
            bugFinder.stop();
            stopBugfinderBtn.hide();
        }
    });

    // Update the existing handleSubmit to only handle chat
    const handleSubmit = async () => {
        if (!openAIService) {
            addMessage('error', 'Please enter your OpenAI API key in the Settings tab first.');
            chatTabs.filter('[data-tab="SETTINGS"]').click();
                    return;
                }

        const message = chatInput.val().trim();
        if (!message) return;

        // Get any attached code blocks
        const attachedBlocks = chatInput.parent().parent().prevAll('.code-block-container').map(function() {
            const content = $(this).find('.code-block-content');
            const code = content.data('code');
            const language = content.data('language');
            return `\`\`\`${language}\n${code}\n\`\`\``;
        }).get().reverse().join('\n\n');

        // Combine attached code blocks with user message
        const fullMessage = attachedBlocks ? `${attachedBlocks}\n\n${message}` : message;

        // Cancel any ongoing request
        if (abortController) {
            abortController.abort();
        }

        // Create new abort controller for this request
        abortController = new AbortController();

        // Add user message
        addMessage('user', fullMessage);

        // Clear input and remove attached code blocks
        chatInput.val('');
        chatInput.css('height', 'auto');
        chatInput.parent().parent().prevAll('.code-block-container').remove();

        try {
            const responseStream = openAIService.chat(fullMessage, abortController.signal);
                await handleStreamingResponse(responseStream);
        } catch (error) {
            if (error.message !== 'Request was cancelled') {
                addMessage('error', 'Error: ' + error.message);
            }
        }
    };

    chatSubmit.on('click', handleSubmit);

    // Handle Ctrl+L shortcut to focus input
    $(document).on('keydown', (e) => {
        if (e.ctrlKey && e.key === 'l') {
            e.preventDefault();
            chatInput.focus();
        }
    });

    // Handle Enter to submit (Shift+Enter for new line)
    chatInput.on('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    });

    // Auto-resize textarea
    chatInput.on('input', function() {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
    });

    // Remove the old selection handler
    $(document).off('selectionchange');
}

async function applyChanges(sourceEditor, code, openAIService, addMessage, chatMessages) {
    console.log('Starting applyChanges function');
    try {
        // Debug input parameters
        console.log('Source editor:', sourceEditor);
        console.log('Code to apply:', code);
        console.log('OpenAI service:', openAIService);

        // Get the user message that came before the AI response
        const messages = Array.from(chatMessages.children());
        const aiMessageIndex = messages.findIndex(msg => 
            $(msg).hasClass('assistant') && 
            $(msg).find('.code-block-content').toArray().some(block => 
                $(block).data('code') === code
            )
        );
        console.log('Found AI message index:', aiMessageIndex);
        
        const userMessage = aiMessageIndex > 0 
            ? $(messages[aiMessageIndex - 1]).hasClass('user')
                ? $(messages[aiMessageIndex - 1]).find('.message-content').text()
                : ''
            : '';
        console.log('User message context:', userMessage);

        // Debug source editor content
        const originalCode = sourceEditor.getValue();
        console.log('Original code length:', originalCode.length);
        console.log('Original code preview:', originalCode.substring(0, 200) + '...');

        // Get AI's suggestion for the complete modified file
        console.log('Requesting modified code from OpenAI...');
        const modifiedCode = await openAIService.integrateCode(originalCode, code, null, userMessage);
        console.log('Modified code length:', modifiedCode.length);
        console.log('Modified code preview:', modifiedCode.substring(0, 200) + '...');

        if (!modifiedCode) {
            console.error('Modified code is empty or null');
            throw new Error('Failed to generate modified code');
        }

        console.log('Creating popup container...');
        // Create popup container for diff view
        const popupContainer = $(`
            <div class="diff-popup-overlay">
                <div class="diff-popup">
                    <div class="diff-popup-header">
                        <h3>Review Changes</h3>
                        <div class="diff-view-options">
                            <label>
                                <input type="checkbox" class="inline-diff-toggle"> Inline Diff
                            </label>
                        </div>
                    </div>
                    <div class="diff-popup-content">
                        <div class="diff-editor-container" style="width: 100%; height: 100%;"></div>
                    </div>
                    <div class="diff-popup-footer">
                        <button class="accept-changes">Apply Changes</button>
                        <button class="reject-changes">Cancel</button>
                    </div>
                </div>
            </div>
        `).appendTo('body');

        // Debug container dimensions
        const containerElement = popupContainer.find('.diff-editor-container')[0];
        const containerRect = containerElement.getBoundingClientRect();
        console.log('Container dimensions:', {
            width: containerRect.width,
            height: containerRect.height,
            top: containerRect.top,
            left: containerRect.left
        });

        // Add styles for the popup
        const styleElement = $(`
            <style>
                .diff-popup-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.7);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 9999;
                }
                .loading-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    z-index: 10000;
                    color: white;
                    font-size: 16px;
                }
                .loading-overlay .spinner {
                    width: 50px;
                    height: 50px;
                    border: 3px solid transparent;
                    border-top-color: #fff;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-bottom: 10px;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .diff-popup {
                    background: #1e1e1e;
                    border-radius: 8px;
                    width: 90%;
                    height: 90%;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
                }
                .diff-popup-header {
                    padding: 16px;
                    border-bottom: 1px solid #333;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .diff-popup-header h3 {
                    margin: 0;
                    color: #fff;
                }
                .diff-view-options {
                    color: #fff;
                }
                .diff-popup-content {
                    flex: 1;
                    position: relative;
                    overflow: hidden;
                    min-height: 0;
                }
                .diff-editor-container {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                }
                .diff-popup-footer {
                    padding: 16px;
                    border-top: 1px solid #333;
                    display: flex;
                    justify-content: flex-end;
                    gap: 8px;
                }
                .diff-popup-footer button {
                    padding: 8px 16px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                }
                .diff-popup-footer .accept-changes {
                    background: #28a745;
                    color: white;
                }
                .diff-popup-footer .reject-changes {
                    background: #dc3545;
                    color: white;
                }
            </style>
        `).appendTo('head');

        // Debug Monaco availability
        console.log('Monaco editor object:', monaco);
        console.log('Monaco editor version:', monaco.editor.EditorVersion);

        // Create diff editor with proper sizing
        const editorContainer = popupContainer.find('.diff-editor-container')[0];
        console.log('Creating diff editor...');
        
        // Wait for container to be properly mounted in DOM
        setTimeout(() => {
            // Initialize the diff editor with proper options
            const diffEditor = monaco.editor.createDiffEditor(editorContainer, {
                renderSideBySide: true,
                readOnly: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                contextmenu: false,
                lineNumbers: 'on',
                glyphMargin: true,
                overviewRulerLanes: 0,
                overviewRulerBorder: false,
                automaticLayout: true,
                theme: 'vs-dark'
            });
            console.log('Diff editor created:', diffEditor);

            // Get the language from the file extension or default to 'javascript'
            const currentFileName = getCurrentFileName();
            const fileExt = currentFileName.split('.').pop();
            const language = getMonacoLanguage(fileExt) || 'javascript';
            console.log('Detected language:', language);

            console.log('Creating models...');
            const originalModel = monaco.editor.createModel(originalCode, language);
            const modifiedModel = monaco.editor.createModel(modifiedCode, language);
            console.log('Models created:', { originalModel, modifiedModel });

            // Set the models
            console.log('Setting models on diff editor...');
            diffEditor.setModel({
                original: originalModel,
                modified: modifiedModel
            });

            // Force initial layout after a short delay to ensure container is ready
            setTimeout(() => {
                const dimensions = {
                    width: editorContainer.clientWidth,
                    height: editorContainer.clientHeight
                };
                console.log('Container dimensions before layout:', dimensions);
                diffEditor.layout();
                console.log('Layout forced');
            }, 100);

            // Handle inline diff toggle
            popupContainer.find('.inline-diff-toggle').on('change', function() {
                console.log('Toggling inline diff mode:', this.checked);
                diffEditor.updateOptions({
                    renderSideBySide: !this.checked
                });
                // Force layout update after changing view mode
                setTimeout(() => {
                    diffEditor.layout();
                    console.log('Layout updated after view mode change');
                }, 50);
            });

            return new Promise((resolve, reject) => {
                // Handle accept changes
                popupContainer.find('.accept-changes').on('click', async () => {
                    console.log('Accept changes clicked');
                    try {
                        // Create and show loading overlay
                        const editorOverlay = $(`
                            <div class="editor-overlay">
                                <div class="loading-spinner">
                                    <i class="circle notch loading icon"></i>
                                    <span>Applying changes...</span>
                                </div>
                            </div>
                        `).appendTo(document.evaluate('/html/body/div[2]/div/div/div[1]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue);

                        // Apply the modified code to the source editor
                        sourceEditor.setValue(modifiedCode);
                        
                        // Clean up
                        popupContainer.remove();
                        styleElement.remove();
                        originalModel.dispose();
                        modifiedModel.dispose();
                        diffEditor.dispose();
                        
                        // Remove the editor overlay with a fade effect
                        editorOverlay.fadeOut(200, () => {
                            editorOverlay.remove();
                        });
                        
                        addMessage('system', 'Changes applied successfully.');
                        console.log('Changes applied and cleanup completed');
                        resolve(true);
    } catch (error) {
        console.error('Error applying changes:', error);
                        // Remove overlay in case of error
                        $('.editor-overlay').fadeOut(200, function() {
                            $(this).remove();
                        });
                        addMessage('error', `Error applying changes: ${error.message}`);
                        reject(error);
                    }
                });

                // Handle reject changes
                popupContainer.find('.reject-changes').on('click', () => {
                    console.log('Reject changes clicked');
                    popupContainer.remove();
                    styleElement.remove();
                    originalModel.dispose();
                    modifiedModel.dispose();
                    diffEditor.dispose();
                    addMessage('system', 'Changes cancelled.');
                    console.log('Changes rejected and cleanup completed');
                    resolve(false);
                });
            });
        }, 0);
    } catch (error) {
        console.error('Error in applyChanges:', error);
        addMessage('error', `Error applying changes: ${error.message}`);
        throw error;
    }
} 