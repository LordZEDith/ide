import { truncateChatHistory } from './utils.js';
import { Service } from './service.js';

export class AnthropicService extends Service {
    static MODEL_INFO = {
        'claude-3-5-sonnet-latest': {
            displayName: 'Claude 3.5 Sonnet',
            description: 'Most capable Claude model, best for complex tasks'
        },
        'claude-3-5-haiku-latest': {
            displayName: 'Claude 3.5 Haiku',
            description: 'Faster and more cost-effective than Sonnet'
        }
    };

    constructor(apiKey) {
        super(apiKey);
        this.model = "claude-3-5-sonnet-latest";
    }

    static getSupportedModels() {
        return Object.keys(AnthropicService.MODEL_INFO);
    }

    static getModelDisplayName(modelId) {
        return AnthropicService.MODEL_INFO[modelId]?.displayName || modelId;
    }

    setModel(model) {
        if (!AnthropicService.MODEL_INFO[model]) {
            throw new Error("Invalid model selected");
        }
        this.model = model;
    }

    async validateApiKey() {
        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                    "anthropic-dangerous-direct-browser-access": "true",
                },
                body: JSON.stringify({
                    model: this.model,
                    max_tokens: 8192,
                    messages: [
                        { role: "user", content: "Hello, world" }
                    ]
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                console.error('Anthropic API validation error:', errorData || response.statusText);
                return false;
            }
            
            const data = await response.json();
            return data.content?.[0]?.text ? true : false;
            
        } catch (error) {
            console.error('Anthropic API validation error:', error);
            return false;
        }
    }

    async *chat(prompt, signal) {
        try {
            // Add user's message to history first
            this.addToHistory("user", prompt);

            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                    "anthropic-dangerous-direct-browser-access": "true",
                },
                body: JSON.stringify({
                    model: this.model,
                    max_tokens: 8192,
                    system: "You are a helpful AI assistant focused on helping with programming tasks.",
                    messages: this.getChatHistory()
                }),
                signal
            });

            if (!response.ok) {
                throw new Error('Anthropic API error: ' + response.statusText);
            }

            const data = await response.json();
            // Extract the text content from the response structure
            const content = data.content?.[0]?.text || '';
            
            // Add assistant's response to history
            this.addToHistory("assistant", content);

            // Truncate chat history while preserving context
            Service.sharedChatHistory = truncateChatHistory(6, this.getChatHistory());

            // Yield the entire response at once
            yield content;

        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request was cancelled');
            }
            throw error;
        }
    }

    async autoComplete(beginning, ending, signal, additionalContext = '', recentClipboard = '', fileExtension = '', languageName = '') {
        try {
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
            `.replace("{beginning}", beginning)
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

            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                    "anthropic-dangerous-direct-browser-access": "true",
                },
                body: JSON.stringify({
                    model: this.model,
                    max_tokens: 8192,
                    system: 'You are a code completion assistant. Complete the code naturally, following the context and style. Only return the completion, no explanations.',
                    messages: [
                        {
                            role: 'user',
                            content: promptTemplate
                        }
                    ],
                    temperature: 0
                }),
                signal
            });

            if (!response.ok) {
                throw new Error('Anthropic API error: ' + response.statusText);
            }

            const data = await response.json();
            let content = data.content?.[0]?.text || '';
            
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
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                    "anthropic-dangerous-direct-browser-access": "true",
                },
                body: JSON.stringify({
                    model: this.model,
                    max_tokens: 8192,
                    system: 'You are a code integration specialist. You help integrate new code into existing files while maintaining code organization and style. You are particularly skilled at fixing code errors while preserving functionality.',
                    messages: [
                        {
                            role: 'user',
                            content: integrationPrompt
                        }
                    ],
                    temperature: 0
                }),
                signal
            });

            if (!response.ok) {
                throw new Error('Anthropic API error: ' + response.statusText);
            }

            const data = await response.json();
            let content = data.content?.[0]?.text || '';
            
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
        Your task is to analyze the provided code for potential bugs, runtime errors, logical errors. Only return hasBugs to true if there is an issue with the code that doesnt allow it to run otherwise if it runs well and there is no logical error then return false.

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
        6. Return ONLY the analysis result in this exact JSON format, and ensure fixedCode has proper newlines:
        {
            "hasBugs": boolean,
            "explanation": "Detailed explanation of bugs found and fixes needed",
            "fixedCode": "The complete fixed code with proper newlines (\\n) not literal newlines"
        }`;

        const userPrompt = `Analyze this code for bugs:

        File type: ${fileExtension}
        Programming language: ${languageName}
        ${input ? `\nUser input: ${input}` : ''}
        ${stdin ? `\nStdin: ${stdin}` : ''}

        Code to analyze:
        \`\`\`${fileExtension}
        ${code}
        \`\`\`

        IMPORTANT: In your response, make sure the fixedCode field contains proper newlines (\\n) and not literal newlines.
        Return the analysis in valid JSON format with no markdown in the fixedCode field.`;

        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                    "anthropic-dangerous-direct-browser-access": "true",
                },
                body: JSON.stringify({
                    model: this.model,
                    max_tokens: 8192,
                    system: systemPrompt,
                    messages: [
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0
                }),
                signal
            });

            if (!response.ok) {
                throw new Error('Anthropic API error: ' + response.statusText);
            }

            const data = await response.json();
            let content = data.content?.[0]?.text || '';
            
            try {
                // First parse the JSON to get the structure
                const parsedContent = JSON.parse(content);
                
                // Clean up the fixedCode field if it contains markdown
                if (parsedContent.fixedCode) {
                    parsedContent.fixedCode = parsedContent.fixedCode
                        .replace(/```[\w]*\n?/g, '')  // Remove opening code block
                        .replace(/\n```$/g, '')       // Remove closing code block
                        .replace(/\\\\n/g, '\\n')     // Handle double escaped newlines
                        .replace(/\\n/g, '\n')        // Replace escaped newlines
                        .replace(/\\"/g, '"')         // Replace escaped quotes
                        .replace(/\\\\/g, '\\')       // Replace escaped backslashes
                        .replace(/\n/g, '\\n')        // Convert literal newlines to escaped newlines
                        .trim();
                }
                
                return parsedContent;
            } catch (error) {
                console.error('Error parsing bug analysis response:', error);
                console.error('Raw content:', content);
                throw new Error('Invalid response format from bug analysis');
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request was cancelled');
            }
            throw error;
        }
    }
} 