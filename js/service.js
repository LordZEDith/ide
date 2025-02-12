export class Service {
    // Static chat history shared across all instances
    static sharedChatHistory = [];

    constructor(apiKey) {
        if (!apiKey?.trim()) {
            throw new Error("API key is required.");
        }
        this.apiKey = apiKey;
        this.model = "";
    }

    // Get the current chat history
    getChatHistory() {
        return Service.sharedChatHistory;
    }

    // Add a message to the shared chat history
    addToHistory(role, content) {
        Service.sharedChatHistory.push({ role, content });
    }

    // Clear the shared chat history
    static clearChatHistory() {
        Service.sharedChatHistory = [];
    }

    // Get supported models for this service
    static getSupportedModels() {
        throw new Error("getSupportedModels must be implemented by child class");
    }

    // Get model display name
    static getModelDisplayName(modelId) {
        throw new Error("getModelDisplayName must be implemented by child class");
    }

    setModel(model) {
        throw new Error("setModel must be implemented by child class");
    }

    async validateApiKey() {
        throw new Error("validateApiKey must be implemented by child class");
    }

    async *chat(prompt, signal) {
        throw new Error("chat must be implemented by child class");
    }

    async autoComplete(beginning, ending, signal, additionalContext = '', recentClipboard = '', fileExtension = '', languageName = '') {
        throw new Error("autoComplete must be implemented by child class");
    }

    async integrateCode(originalCode, newCode, signal, userPrompt = '', fileExtension = '', languageName = '', errors = []) {
        throw new Error("integrateCode must be implemented by child class");
    }

    async analyzeBugs(code, fileExtension, languageName, input = '', stdin = '', signal) {
        throw new Error("analyzeBugs must be implemented by child class");
    }
} 