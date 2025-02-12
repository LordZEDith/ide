import { truncateChatHistory } from './utils.js';
import { Service } from './service.js';

export class OpenAIService extends Service {
    static MODEL_INFO = {
        'gpt-4o': {
            displayName: 'GPT-4o',
            description: 'Most capable model, best for complex tasks'
        },
        'gpt-4o-mini': {
            displayName: 'GPT-4o Mini',
            description: 'Faster and more cost-effective than GPT-4o'
        },
        'o1': {
            displayName: 'GPT-o1',
            description: 'Uses advanced reasoning'
        },
        'o3-mini': {
            displayName: 'GPT-o3 Mini',
            description: 'Fast at advanced reasoning'
        }
    };

    constructor(apiKey) {
        super(apiKey);
        this.model = "gpt-4o-mini";
    }

    static getSupportedModels() {
        return Object.keys(OpenAIService.MODEL_INFO);
    }

    static getModelDisplayName(modelId) {
        return OpenAIService.MODEL_INFO[modelId]?.displayName || modelId;
    }

    setModel(model) {
        if (!OpenAIService.MODEL_INFO[model]) {
            throw new Error("Invalid model selected");
        }
        this.model = model;
    }

    async validateApiKey() {
        try {
            const response = await fetch('https://api.openai.com/v1/models', {
                headers: {
                    'Authorization': 'Bearer ' + this.apiKey
                }
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    async *chat(prompt, signal) {
        try {
            // Add user's message to history first
            this.addToHistory("user", prompt);

            const messages = [
                {
                    role: "system",
                    content: "You are a helpful AI assistant focused on helping with programming tasks."
                },
                ...this.getChatHistory()
            ];

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + this.apiKey
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: messages,
                    stream: true
                }),
                signal
            });

            if (!response.ok) {
                throw new Error('OpenAI API error: ' + response.statusText);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let assistantResponse = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value);
                const lines = buffer.split('\n');
                
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                        try {
                            const data = JSON.parse(line.slice(6));
                            const content = data.choices[0]?.delta?.content || '';
                            if (content) {
                                assistantResponse += content;
                                yield content;
                            }
                        } catch (e) {
                            console.warn('Error parsing streaming response:', e);
                            continue;
                        }
                    }
                }
            }

            // Add assistant's response to history
            this.addToHistory("assistant", assistantResponse);

            // Truncate chat history while preserving context
            Service.sharedChatHistory = truncateChatHistory(6, this.getChatHistory());

        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request was cancelled');
            }
            throw error;
        }
    }


    async autoComplete(beginning, ending, signal, additionalContext = '', recentClipboard = '', fileExtension = '', languageName = '') {
        console.log('autoComplete called with:', {
            beginningPreview: beginning.slice(-50),
            endingPreview: ending.slice(0, 50),
            hasAdditionalContext: !!additionalContext,
            hasRecentClipboard: !!recentClipboard,
            fileExtension,
            languageName
        });

        try {
            console.log('Preparing OpenAI API request...');
            const promptTemplate = `
                You are a senior full-stack developer specializing in writing clean, 
                maintainable code and natural language content.

                **Objective:**
                Complete the code naturally, following the context and style. 
                Provide only the completion, no explanations.

                **Context:**
                - File type: ${fileExtension}
                - Programming language: ${languageName}

                **Rules:**
                - Generate only the completion that follows the cursor position [CURSOR]
                - Return plain text without markdown formatting
                - Follow existing:
                    • Code style and patterns
                    • Indentation and formatting 
                    • Variable naming conventions
                    • Type safety and language patterns
                - Consider surrounding context for better continuity
                - If intent is unclear, return an empty response
                - Generate code specific to the file type and programming language specified

                Context:
                {context}

                **CRITICAL:**
                - Do not return any other text or explanations
                - Only return the code that should follow the cursor
                - Ensure the code follows the syntax and conventions of ${languageName}

                Code to complete:
                {beginning}[CURSOR]{ending}
            `;

            const prompt = promptTemplate
                .replace("{beginning}", beginning)
                .replace("{ending}", ending)
                .replace(
                    "{context}",
                    `The following are some of the types and context available in the file. 
                    Use these while considering how to complete the code provided. 
                    Do not repeat or use these types in your answer.

                    ${additionalContext || ""}

                    -----

                    ${recentClipboard 
                        ? `The user recently copied these items to their clipboard, use them if they are relevant to the completion:

                        ${recentClipboard}

                        -----`
                        : ""
                    }`
                );

            const requestBody = {
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a code completion assistant. Complete the code naturally, following the context and style. Only return the completion, no explanations.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0,
            };
            console.log('Request body prepared:', JSON.stringify(requestBody, null, 2));

            console.log('Sending request to OpenAI API...');
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + this.apiKey
                },
                body: JSON.stringify(requestBody),
                signal
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('OpenAI API error:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: errorText
                });
                throw new Error('OpenAI API error: ' + response.statusText);
            }

            console.log('Received response from OpenAI API');
            const data = await response.json();
            console.log('Response data:', data);

            let content = data.choices[0]?.message?.content || '';
            console.log('Raw completion content:', content);
            
            // Clean up any markdown code blocks if present
            content = content.replace(/```[\w]*\n?|\n```$/g, '').trim();
            console.log('Cleaned completion content:', content);
            
            return content;
        } catch (error) {
            console.error('Error in autoComplete:', error);
            if (error.name === 'AbortError') {
                console.log('Request was cancelled');
                throw new Error('Request was cancelled');
            }
            throw error;
        }
    }

    async integrateCode(originalCode, newCode, signal, userPrompt = '', fileExtension = '', languageName = '', errors = []) {
        const integrationPrompt = `I have an existing code file and I want to add/integrate new code into it.

        Language Context:
        - File Type: ${fileExtension}
        - Programming Language: ${languageName}
        ${errors.length > 0 ? `
        Current Errors to Fix:
        ${errors.map(e => `- Line ${e.line}: ${e.message}`).join('\n')}` : ''}

        User's request:
        ${userPrompt}

        Existing code in the editor:
        \`\`\`${fileExtension}
        ${originalCode}
        \`\`\`

        ${newCode ? `
        New code to integrate:
        \`\`\`${fileExtension}
        ${newCode}
        \`\`\`
        ` : ''}

        Please provide the complete updated file content with the requested changes.

        Rules:
        1. Keep all existing code intact unless explicitly asked to modify or remove something
        2. Add new code in a logical place (e.g., new functions at the end of the file, new imports at the top)
        3. Maintain consistent style and indentation
        4. Return ONLY the complete file content, no explanations
        5. Follow the user's instructions about what to add, modify, or remove
        6. Ensure the code follows ${languageName} syntax and best practices
        7. Fix any errors mentioned in the error list while maintaining the code's intent

        Return the complete file content that I should use to replace the current file.`;

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + this.apiKey
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [{
                        role: 'system',
                        content: 'You are a code integration specialist. You help integrate new code into existing files while maintaining code organization and style. You are particularly skilled at fixing code errors while preserving functionality.'
                    }, {
                        role: 'user',
                        content: integrationPrompt
                    }],
                    temperature: 0
                }),
                signal
            });

            if (!response.ok) {
                throw new Error('OpenAI API error: ' + response.statusText);
            }

            const data = await response.json();
            let content = data.choices[0]?.message?.content || '';
            
            // Clean up any markdown code blocks if present
            content = content.replace(/```[\w]*\n?|\n```$/g, '').trim();
            
            return content;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request was cancelled');
            }
            throw error;
        }
    }

    async analyzeBugs(code, fileExtension, languageName, input = '', stdin = '', signal) {
        const systemPrompt = `You are a code analysis expert specializing in finding and fixing bugs. 
        Your task is to analyze the provided code for potential bugs, runtime errors, logical errors, and performance issues.

        Rules for analysis:
        1. Consider the programming language, compiler, and file type context
        2. Check for:
           - Syntax errors
           - Runtime errors 
           - Logic bugs
           - Memory leaks
           - Performance issues
           - Security vulnerabilities
           - Edge cases
        3. If input/stdin is provided, consider how the code handles that input
        4. Provide specific explanations for each bug found
        5. Suggest fixes that maintain the original code's intent
        6. Return ONLY the analysis result in this exact JSON format:
        {
            "hasBugs": boolean,
            "explanation": "Detailed explanation of bugs found and fixes needed",
            "fixedCode": "Complete fixed version of the code"
        }`;

        const userPrompt = `Analyze this code for bugs:

        File type: ${fileExtension}
        Programming language: ${languageName}
        ${input ? `\nUser input: ${input}` : ''}
        ${stdin ? `\nStdin: ${stdin}` : ''}

        Code to analyze:
        \`\`\`${fileExtension}
        ${code}
        \`\`\``;

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + this.apiKey
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0
                }),
                signal
            });

            if (!response.ok) {
                throw new Error('OpenAI API error: ' + response.statusText);
            }

            const data = await response.json();
            let content = data.choices[0]?.message?.content || '';
            
            try {
                return JSON.parse(content);
            } catch (error) {
                console.error('Error parsing bug analysis response:', error);
                throw new Error('Invalid response format from bug analysis');
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request was cancelled');
            }
            throw error;
        }
    }

    clearChatHistory() {
        this.chatHistory = [];
    }
} 