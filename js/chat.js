import { OpenAIService } from './openai_service.js';
import { AnthropicService } from './anthropic_service.js';
import { Composer } from './composer.js';
import { BugFinder } from './bug_finder.js';
import { AutoComplete } from './auto_complete.js';

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

// Helper function to create appropriate service instance
function createService(type, apiKey) {
    switch (type?.toLowerCase()) {
        case 'anthropic':
            return new AnthropicService(apiKey);
        case 'openai':
        default:
            return new OpenAIService(apiKey);
    }
}

let service;
let composer;
let bugFinder;
let autoComplete;

export function initChat(container, state) {
    let activeTab = 'CHAT';
    let abortController;

    // Create the chat component HTML
    const chatHTML = `
        <div class="chat-container">
            <div class="chat-tabs">
                <div class="chat-tab active" data-tab="CHAT">CHAT</div>
                <div class="chat-tab" data-tab="COMPOSER">COMPOSER</div>
                <div class="chat-tab" data-tab="BUG FINDER">BUG FINDER</div>
                <div class="chat-tab" data-tab="SETTINGS">SETTINGS</div>
            </div>
            <div class="model-selector-container">
                <select class="model-selector">
                    <option value="" disabled selected>Select a model...</option>
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
                    <h3>AI Service Configuration</h3>
                    <div class="service-selector-section">
                        <label for="service-selector">Select AI Service:</label>
                        <select class="service-selector">
                            <option value="openai">OpenAI</option>
                            <option value="anthropic">Anthropic</option>
                        </select>
                    </div>
                    <div class="api-key-section">
                        <label class="api-key-label">API Key:</label>
                        <div class="api-key-input-wrapper">
                            <input type="password" class="api-key-input" placeholder="Enter your API key">
                            <i class="check circle outline icon api-key-status"></i>
                        </div>
                        <p class="api-key-description">Your API key is stored locally and never sent to our servers.</p>
                        <button class="api-key-submit">Save API Key</button>
                    </div>
                    <div class="model-section">
                        <h4>Available Models</h4>
                        <div class="model-list">
                            <!-- Model cards will be added here -->
                        </div>
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

    // Update the service selector event handler
    const serviceSelector = container.getElement().find('.service-selector');
    const serviceNameLabel = container.getElement().find('.service-name-label');
    const modelSection = container.getElement().find('.model-section');
    const modelList = container.getElement().find('.model-list');

    serviceSelector.on('change', async function() {
        const serviceType = $(this).val();
        const savedApiKey = localStorage.getItem(`${serviceType}_api_key`);
        
        if (savedApiKey) {
            $('.api-key-input').val(savedApiKey);
            try {
                service = createService(serviceType, savedApiKey);
                await updateApiKeyStatus(savedApiKey);
                
                // Store the new service type immediately
                localStorage.setItem('last_service_type', serviceType);
                
                // Update model selector and cards for the new service
                const ServiceClass = service.constructor;
                const models = ServiceClass.getSupportedModels();
                
                modelSelector.empty();
                modelList.empty();
                
                models.forEach(modelId => {
                    const modelInfo = ServiceClass.MODEL_INFO[modelId];
                    
                    // Add to dropdown
                    const option = new Option(modelInfo.displayName, modelId);
                    if (modelId === service.model) {
                        option.selected = true;
                    }
                    modelSelector.append(option);
                    
                    // Create model card
                    const modelCard = $('<div class="model-card' + (modelId === service.model ? ' selected' : '') + '" data-model-id="' + modelId + '">' +
                        '<div class="model-card-header">' +
                        '<div class="model-name">' + modelInfo.displayName + '</div>' +
                        '</div>' +
                        '<div class="model-description">' + modelInfo.description + '</div>' +
                        '</div>');
                    modelList.append(modelCard);
                });

                // Update or initialize AutoComplete with the new service
                if (window.sourceEditor) {
                    if (autoComplete) {
                        // Dispose of the old instance first
                        autoComplete.dispose();
                    }
                    // Create a new instance with the new service
                    autoComplete = new AutoComplete(window.sourceEditor, service);
                }
            } catch (error) {
                console.error('Error initializing service:', error);
                // Keep settings visible if there's an error
                settingsContainer.show();
            }
        } else {
            $('.api-key-input').val('');
            $('.api-key-status').removeClass('valid invalid');
            $('.model-list').empty();
            modelSelector.empty().append('<option value="" disabled selected>Select a model...</option>');
            // Keep settings visible when no API key is found
            settingsContainer.show();
        }
    });

    // Update the API key validation and model display
    async function updateApiKeyStatus(apiKey) {
        try {
            if (!apiKey) {
                $('.api-key-status').removeClass('valid invalid');
                modelSelector.empty().append('<option value="" disabled selected>Select a model...</option>');
                modelList.empty();
                addMessage('system', 'Please enter your API key to start chatting.');
                // Keep settings visible when no API key is provided
                settingsContainer.show();
                return false;
            }

            const serviceType = $('.service-selector').val();
            const isValid = await service.validateApiKey();
            
            if (isValid) {
                $('.api-key-status').removeClass('invalid').addClass('valid');
                localStorage.setItem(`${serviceType}_api_key`, apiKey);
                localStorage.setItem('last_service_type', serviceType);
                
                // Update model selector and model list
                modelSelector.empty();
                modelList.empty();
                
                const ServiceClass = service.constructor;
                const models = ServiceClass.getSupportedModels();
                
                models.forEach(modelId => {
                    const modelInfo = ServiceClass.MODEL_INFO[modelId];
                    
                    // Add to dropdown
                    const option = new Option(modelInfo.displayName, modelId);
                    if (modelId === service.model) {
                        option.selected = true;
                    }
                    modelSelector.append(option);
                    
                    // Create model card
                    const modelCard = $('<div class="model-card' + (modelId === service.model ? ' selected' : '') + '" data-model-id="' + modelId + '">' +
                        '<div class="model-card-header">' +
                        '<div class="model-name">' + modelInfo.displayName + '</div>' +
                        '</div>' +
                        '<div class="model-description">' + modelInfo.description + '</div>' +
                        '</div>');
                    modelList.append(modelCard);
                });

                // Only hide settings if we're not in the Settings tab
                if (activeTab !== 'SETTINGS') {
                    settingsContainer.hide();
                    chatMessages.show();
                    chatInput.parent().parent().show();
                }
                
                addMessage('system', 'API key saved successfully. You can now use the chat!');
                return true;
            } else {
                $('.api-key-status').removeClass('valid').addClass('invalid');
                modelSelector.empty().append('<option value="" disabled selected>Select a model...</option>');
                modelList.empty();
                addMessage('error', 'Invalid API key. Please check your key and try again.');
                // Keep settings visible when API key is invalid
                settingsContainer.show();
                return false;
            }
        } catch (error) {
            console.error('Error validating API key:', error);
            $('.api-key-status').removeClass('valid').addClass('invalid');
            modelSelector.empty().append('<option value="" disabled selected>Select a model...</option>');
            modelList.empty();
            addMessage('error', 'Error validating API key: ' + error.message);
            // Keep settings visible when there's an error
            settingsContainer.show();
            return false;
        }
    }

    // Handle API key submission
    apiKeySubmit.on('click', async () => {
        const serviceType = serviceSelector.val();
        const apiKey = apiKeyInput.val().trim();
        
        if (!apiKey) {
            addMessage('error', 'Please enter an API key.');
            return;
        }

        try {
            service = createService(serviceType, apiKey);
            await updateApiKeyStatus(apiKey);
        } catch (error) {
            addMessage('error', 'Error validating API key: ' + error.message);
        }
    });

    // Handle model selection
    modelSelector.on('change', function() {
        const selectedModel = $(this).val();
        if (service && selectedModel) {
            service.setModel(selectedModel);
        }
    });

    // Initialize the chat component
    async function initializeChat() {
        // Check for saved API key on initialization
        const savedServiceType = localStorage.getItem('last_service_type') || 'openai';
        $('.service-selector').val(savedServiceType);
        const savedApiKey = localStorage.getItem(`${savedServiceType}_api_key`);

        if (savedApiKey) {
            try {
                $('.api-key-input').val(savedApiKey);
                service = createService(savedServiceType, savedApiKey);
                const isValid = await updateApiKeyStatus(savedApiKey);
                
                if (isValid) {
                    settingsContainer.hide();
                    chatMessages.show();
                    chatInput.parent().parent().show();
                    
                    // Initialize AutoComplete with the service
                    if (window.sourceEditor && !autoComplete) {
                        autoComplete = new AutoComplete(window.sourceEditor, service);
                    }
                } else {
                    settingsContainer.show();
                    addMessage('system', 'Please enter a valid API key to start chatting.');
                }
            } catch (error) {
                console.error('Error initializing service:', error);
                settingsContainer.show();
                addMessage('system', 'Please enter your API key to start chatting.');
            }
        } else {
            settingsContainer.show();
            addMessage('system', 'Please enter your API key to start chatting.');
        }
    }

    // Call the initialization function
    initializeChat().catch(error => {
        console.error('Error during initialization:', error);
        settingsContainer.show();
        addMessage('system', 'An error occurred during initialization. Please try again.');
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

        // If it's a system message, set it to disappear after 3.5 seconds
        if (role === 'system') {
            setTimeout(() => {
                messageDiv.fadeOut(500, function() {
                    $(this).remove();
                });
            }, 3500);
        }

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
                            if (service) {
                                const responseStream = service.chat(newText, abortController.signal);
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

                        await applyChanges(sourceEditor, code, service, addMessage, chatMessages);

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

                        // Debug container dimensions
                        const containerElement = popupContainer.find('.diff-editor-container')[0];
                        const containerRect = containerElement.getBoundingClientRect();
                        console.log('Container dimensions:', {
                            width: containerRect.width,
                            height: containerRect.height,
                            top: containerRect.top,
                            left: containerRect.left
                        });

                        // Debug Monaco availability
                        console.log('Monaco editor object:', monaco);
                        console.log('Monaco editor version:', monaco.editor.EditorVersion);

                        // Create diff editor
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

                            // Get the language from the file extension
                            const currentFileName = getCurrentFileName();
                            const fileExt = currentFileName.split('.').pop();
                            const language = getMonacoLanguage(fileExt) || 'javascript';
                            console.log('Detected language:', language);

                            console.log('Creating models...');
                            const originalModel = monaco.editor.createModel(originalCode, language);
                            const modifiedModel = monaco.editor.createModel(code, language);
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
                                        sourceEditor.setValue(code);
                                        
                                        // Clean up
                                        popupContainer.remove();
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
                    // Configure marked options for text segments
                    const renderer = new marked.Renderer();
                    renderer.codespan = (code) => `<code class="inline-code">${code}</code>`;
                    renderer.code = (code, language) => `<code class="inline-code">${code}</code>`;
                    renderer.link = (href, title, text) => 
                        `<a href="${href}" title="${title || ''}" target="_blank" rel="noopener noreferrer">${text}</a>`;
                    
                    const html = marked.parse(segment.content, { renderer });
                    
                    // Stream text content word by word
                    const words = html.split(/(?<=>)(?=<)|(?<=[.!?])\s+/g);
                    for (const word of words) {
                        streamingDiv.append(word);
                        chatMessages.scrollTop(chatMessages[0].scrollHeight);
                        await new Promise(resolve => setTimeout(resolve, 50));
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
                    await new Promise(resolve => setTimeout(resolve, 50));
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
        if (!service) {
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

        // Create message div for assistant's response with thinking animation
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

                const responseStream = service.chat(fullMessage, abortController.signal);
                
                // Remove thinking animation
                thinkingDiv.remove();

                // Create a div for the response content
                const streamingDiv = $('<div></div>').css('white-space', 'pre-wrap');
                messageDiv.append(streamingDiv);

                // Collect the full response
                let fullContent = '';
                for await (const chunk of responseStream) {
                    fullContent += chunk;
                }

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
            composer = new Composer(sourceEditor, service);
        }

        // Show stop button
        stopComposerBtn.show();

        try {
            addMessage('system', 'Starting composer process...', true);

            const result = await composer.processRequest(fullMessage);

            thinkingDiv.remove();
            
            if (result.needsPreview) {
                // Create the message content in the existing message div
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
                bugFinder = new BugFinder(sourceEditor, service);
            }

            // Show stop button
            stopBugfinderBtn.show();

            // Get stdin from the stdin editor if it exists
            const stdin = window.stdinEditor ? window.stdinEditor.getValue().trim() : '';

            // Create message div for assistant's response with thinking animation
            const messageDiv = $('<div></div>')
                .addClass('message')
                .addClass('assistant');
            bugfinderMessages.append(messageDiv);

            // Show thinking animation
            const thinkingDiv = $('<div></div>')
                .addClass('thinking-animation')
                .css({
                    'padding': '0.75rem',
                    'color': '#888'
                })
                .html('<i class="circle notch loading icon"></i> Thinking...');
            messageDiv.append(thinkingDiv);

            // Only pass non-empty values
            const result = await bugFinder.findBugs(
                input || undefined,
                stdin || undefined
            );
            
            // Remove thinking animation
            thinkingDiv.remove();

            if (result.success) {
                if (!result.hasBugs) {
                    addMessage('system', '✓ ' + result.message, false, true);
                } else {
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
        if (!service) {
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
            const responseStream = service.chat(fullMessage, abortController.signal);
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

    // Update model selection handling
    modelList.on('click', '.model-card', function() {
        const modelName = $(this).find('.model-name').text();
        const ServiceClass = service.constructor;
        const modelId = Object.entries(ServiceClass.MODEL_INFO).find(
            ([_, info]) => info.displayName === modelName
        )?.[0];

        if (modelId) {
            // Update visual selection
            modelList.find('.model-card').removeClass('selected');
            $(this).addClass('selected');
            
            // Update service model
            service.setModel(modelId);
            
            // Update the model selector in the chat interface
            modelSelector.val(modelId);
            
            addMessage('system', `Model switched to ${modelName}`);
        }
    });

    // Return addMessage function so it can be used elsewhere
    return {
        addMessage
    };
}

async function applyChanges(sourceEditor, code, service, addMessage, chatMessages) {
    console.log('Starting applyChanges function');
    try {
        // Debug input parameters
        console.log('Source editor:', sourceEditor);
        console.log('Code to apply:', code);

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
            ? ($(messages[aiMessageIndex - 1]).hasClass('user')
                ? $(messages[aiMessageIndex - 1]).find('.message-content').text()
                : '')
            : '';
        console.log('User message context:', userMessage);

        // Debug source editor content
        const originalCode = sourceEditor.getValue();
        console.log('Original code length:', originalCode.length);
        console.log('Original code preview:', originalCode.substring(0, 200) + '...');

        // Get AI's suggestion for the complete modified file
        console.log('Requesting modified code from OpenAI...');
        const modifiedCode = await service.integrateCode(originalCode, code, null, userMessage);
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